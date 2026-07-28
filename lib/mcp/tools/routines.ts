import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok, fail, TIME_OF_DAY, type AdminClient } from "@/lib/mcp/shared";

export function registerRoutineTools(server: McpServer, admin: AdminClient, userId: string) {
  // --- Routines ---

  server.registerTool(
    "list_routines",
    {
      title: "List routines",
      description: "List Antoine's routines (ordered sequences of steps tied to a time of day).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("routines")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "list_routine_items",
    {
      title: "List routine steps",
      description: "List the ordered steps of a routine.",
      inputSchema: { routine_id: z.string().uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ routine_id }) => {
      const { data, error } = await admin
        .from("routine_items")
        .select("*")
        .eq("routine_id", routine_id)
        .eq("user_id", userId)
        .order("sort_order");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_routine",
    {
      title: "Create routine",
      description: "Create a new routine — an ordered sequence of steps tied to a time of day.",
      inputSchema: {
        name: z.string().min(1),
        time_of_day: z.enum(TIME_OF_DAY).optional().describe("Defaults to morning"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ name, time_of_day }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");

      const { data, error } = await admin
        .from("routines")
        .insert({ user_id: userId, name: trimmed, time_of_day })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_routine",
    {
      title: "Update routine",
      description: "Rename a routine, change its time of day, or pause it (active: false).",
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        time_of_day: z.enum(TIME_OF_DAY).optional(),
        active: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, name, ...rest }) => {
      const updates: Record<string, unknown> = { ...rest };
      if (name !== undefined) {
        const trimmed = name.trim();
        if (!trimmed) return fail("Name cannot be empty");
        updates.name = trimmed;
      }

      const { data, error } = await admin
        .from("routines")
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
    "delete_routine",
    {
      title: "Delete routine",
      description: "Move a routine (and its steps) to trash. Recoverable for 30 days.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("routines")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  server.registerTool(
    "add_routine_item",
    {
      title: "Add routine step",
      description: "Append a new step to the end of a routine.",
      inputSchema: {
        routine_id: z.string().uuid(),
        title: z.string().min(1),
        duration_minutes: z.number().int().min(1).optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ routine_id, title, duration_minutes }) => {
      const trimmed = title.trim();
      if (!trimmed) return fail("Title is required");

      const { data: last, error: lastError } = await admin
        .from("routine_items")
        .select("sort_order")
        .eq("routine_id", routine_id)
        .eq("user_id", userId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError) return fail(lastError.message);

      const { data, error } = await admin
        .from("routine_items")
        .insert({
          user_id: userId,
          routine_id,
          title: trimmed,
          duration_minutes: duration_minutes ?? null,
          sort_order: last ? last.sort_order + 1 : 0,
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_routine_item",
    {
      title: "Update routine step",
      description: "Update a routine step's title, duration, or sort order.",
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        duration_minutes: z.number().int().min(1).nullable().optional(),
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
        .from("routine_items")
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
    "delete_routine_item",
    {
      title: "Delete routine step",
      description: "Remove a single step from a routine. Not recoverable — routine steps aren't trashed individually.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin.from("routine_items").delete().eq("id", id).eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );
}
