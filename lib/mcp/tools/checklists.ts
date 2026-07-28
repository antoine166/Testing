import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok, fail, type AdminClient } from "@/lib/mcp/shared";

export function registerChecklistTools(server: McpServer, admin: AdminClient, userId: string) {
  // --- Checklists ---

  server.registerTool(
    "list_checklists",
    {
      title: "List checklists",
      description: "List Antoine's reusable, resettable checklists (e.g. a packing list).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("checklists")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "list_checklist_items",
    {
      title: "List checklist items",
      description: "List the items on a checklist, in order, with their checked state.",
      inputSchema: { checklist_id: z.string().uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ checklist_id }) => {
      const { data, error } = await admin
        .from("checklist_items")
        .select("*")
        .eq("checklist_id", checklist_id)
        .eq("user_id", userId)
        .order("sort_order");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_checklist",
    {
      title: "Create checklist",
      description: "Create a new empty checklist.",
      inputSchema: { name: z.string().min(1) },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ name }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");

      const { data, error } = await admin
        .from("checklists")
        .insert({ user_id: userId, name: trimmed })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_checklist",
    {
      title: "Rename checklist",
      description: "Rename a checklist.",
      inputSchema: { id: z.string().uuid(), name: z.string().min(1) },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, name }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name cannot be empty");

      const { data, error } = await admin
        .from("checklists")
        .update({ name: trimmed })
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "delete_checklist",
    {
      title: "Delete checklist",
      description: "Move a checklist (and its items) to trash. Recoverable for 30 days.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("checklists")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  server.registerTool(
    "reset_checklist",
    {
      title: "Reset checklist",
      description: "Uncheck every item on a checklist in one action, so it's ready to reuse.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("checklist_items")
        .update({ checked: false })
        .eq("checklist_id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ reset: id });
    },
  );

  server.registerTool(
    "add_checklist_item",
    {
      title: "Add checklist item",
      description: "Append a new item to the end of a checklist.",
      inputSchema: { checklist_id: z.string().uuid(), title: z.string().min(1) },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ checklist_id, title }) => {
      const trimmed = title.trim();
      if (!trimmed) return fail("Title is required");

      const { data: last, error: lastError } = await admin
        .from("checklist_items")
        .select("sort_order")
        .eq("checklist_id", checklist_id)
        .eq("user_id", userId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError) return fail(lastError.message);

      const { data, error } = await admin
        .from("checklist_items")
        .insert({
          user_id: userId,
          checklist_id,
          title: trimmed,
          sort_order: last ? last.sort_order + 1 : 0,
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_checklist_item",
    {
      title: "Update checklist item",
      description: "Check/uncheck a checklist item, rename it, or change its order.",
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        checked: z.boolean().optional(),
        sort_order: z.number().int().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, title, ...rest }) => {
      const updates: Record<string, unknown> = { ...rest };
      if (title !== undefined) {
        const trimmed = title.trim();
        if (!trimmed) return fail("Title cannot be empty");
        updates.title = trimmed;
      }

      const { data, error } = await admin
        .from("checklist_items")
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
    "delete_checklist_item",
    {
      title: "Delete checklist item",
      description: "Remove a single item from a checklist. Not recoverable — items aren't trashed individually.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin.from("checklist_items").delete().eq("id", id).eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );
}
