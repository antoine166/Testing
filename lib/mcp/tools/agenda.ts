import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok, fail, type AdminClient } from "@/lib/mcp/shared";

export function registerAgendaTools(server: McpServer, admin: AdminClient, userId: string) {
  // --- Agendas (GTD "bring up with a person next time") ---

  server.registerTool(
    "list_agenda_items",
    {
      title: "List agenda items",
      description:
        "List Antoine's GTD agenda items — things to bring up with a specific person next time he " +
        "talks to them. Each has a person_name, a note, and a done flag.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("agenda_items")
        .select("*")
        .eq("user_id", userId)
        .order("created_at");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_agenda_item",
    {
      title: "Create agenda item",
      description:
        "Add something to bring up with a specific person next time Antoine talks to them " +
        "(e.g. \"ask Sarah about the Q3 budget\").",
      inputSchema: {
        person_name: z.string().min(1).describe("Who to bring this up with — free text, not a contact record."),
        note: z.string().min(1).describe("What to bring up."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ person_name, note }) => {
      const trimmedName = person_name.trim();
      const trimmedNote = note.trim();
      if (!trimmedName || !trimmedNote) return fail("person_name and note are required");

      const { data, error } = await admin
        .from("agenda_items")
        .insert({ user_id: userId, person_name: trimmedName, note: trimmedNote })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_agenda_item",
    {
      title: "Update agenda item",
      description:
        "Update an agenda item's person, note, or done state (e.g. mark it done once it's been discussed).",
      inputSchema: {
        id: z.string().uuid(),
        person_name: z.string().min(1).optional(),
        note: z.string().min(1).optional(),
        done: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, person_name, note, done }) => {
      const updates: Record<string, unknown> = {};
      if (person_name !== undefined) {
        const trimmed = person_name.trim();
        if (!trimmed) return fail("person_name cannot be empty");
        updates.person_name = trimmed;
      }
      if (note !== undefined) {
        const trimmed = note.trim();
        if (!trimmed) return fail("note cannot be empty");
        updates.note = trimmed;
      }
      if (done !== undefined) updates.done = done;

      const { data, error } = await admin
        .from("agenda_items")
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "delete_agenda_item",
    {
      title: "Delete agenda item",
      description:
        "Permanently delete an agenda item. Unlike tasks/projects these aren't in the Trash system, " +
        "so this can't be undone.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("agenda_items")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );
}
