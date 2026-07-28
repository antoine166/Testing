import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TRASH_CONFIG, TRASH_TYPES, type TrashType } from "@/lib/trash";
import { syncTaskCalendarEvent, syncTaskCalendarEvents, findCalendarAffectedTaskIds } from "@/lib/google-calendar/sync";
import { ok, fail, RESTORABLE_TRASH_TYPES, type AdminClient } from "@/lib/mcp/shared";

export function registerTrashTools(server: McpServer, admin: AdminClient, userId: string) {
  // --- Trash (soft-delete recovery) ---

  server.registerTool(
    "list_trash",
    {
      title: "List trash",
      description:
        "List items currently in the Trash — soft-deleted and recoverable for 30 days. Use this to " +
        "find something to restore. Trashed domains appear here for reference, but restoring a domain " +
        "(and permanently purging anything) stays app-only.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const results = await Promise.all(
        TRASH_TYPES.map((type) => {
          const { table, nameField } = TRASH_CONFIG[type];
          return admin
            .from(table)
            .select(`id, ${nameField}, deleted_at`)
            .eq("user_id", userId)
            .not("deleted_at", "is", null);
        }),
      );

      const items: { id: string; type: TrashType; name: string; deleted_at: string }[] = [];
      results.forEach((res, i) => {
        const type = TRASH_TYPES[i];
        const { nameField } = TRASH_CONFIG[type];
        if (res.error || !res.data) return;
        for (const row of res.data as unknown as Record<string, unknown>[]) {
          items.push({
            id: row.id as string,
            type,
            name: (row[nameField] as string) || "(untitled)",
            deleted_at: row.deleted_at as string,
          });
        }
      });
      items.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
      return ok(items);
    },
  );

  server.registerTool(
    "restore_from_trash",
    {
      title: "Restore from trash",
      description:
        "Restore a soft-deleted item from the Trash. Works for tasks, projects (restoring a project " +
        "also restores the tasks trashed with it), habits, workouts, routines, checklists, knowledge " +
        "items, tickler items, and people. Domain restore and permanent purge are deliberately app-only.",
      inputSchema: {
        type: z.enum(RESTORABLE_TRASH_TYPES),
        id: z.string().uuid(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ type, id }) => {
      const config = TRASH_CONFIG[type];
      if (config.restoreRpc && config.restoreRpcParam) {
        const { error } = await admin.rpc(config.restoreRpc, {
          [config.restoreRpcParam]: id,
          p_user_id: userId,
        });
        if (error) return fail(error.message);
        // Restored tasks (a project restore cascades them back) may be
        // time-blocked — push their Google Calendar events back too.
        if (type === "project") {
          await syncTaskCalendarEvents(userId, await findCalendarAffectedTaskIds(userId, { projectId: id }));
        }
        return ok({ restored: id, type });
      }

      const { data, error } = await admin
        .from(config.table)
        .update({ deleted_at: null })
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) return fail(error.message);
      if (type === "task") {
        // A restored time-blocked task should get its calendar event back.
        await syncTaskCalendarEvent(userId, id);
      }
      return ok(data);
    },
  );
}
