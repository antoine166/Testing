import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok, fail, type AdminClient } from "@/lib/mcp/shared";

export function registerDomainContextTools(server: McpServer, admin: AdminClient, userId: string) {
  // --- Domains & projects (read-only context for now — manage these in the app) ---

  server.registerTool(
    "list_domains",
    {
      title: "List domains",
      description: "List Antoine's life domains (the top-level areas tasks and projects are organized under).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("domains")
        .select("id, name, color, icon, sort_order")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("sort_order")
        .order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_domain",
    {
      title: "Create domain",
      description: "Create a new top-level life domain (e.g. Health, Finance, Business) for organizing tasks and projects.",
      inputSchema: {
        name: z.string().min(1),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe("Hex color, e.g. #3b82f6. Omit to use the app's default."),
        icon: z.string().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ name, color, icon }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");

      const { data, error } = await admin
        .from("domains")
        .insert({ user_id: userId, name: trimmed, color, icon })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_domain",
    {
      title: "Update domain",
      description:
        "Rename, recolor, or reorder an existing domain. sort_order controls the sidebar (and every " +
        "domain-grouped view) — lower numbers sort first.",
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe("Hex color, e.g. #3b82f6"),
        icon: z.string().optional(),
        sort_order: z.number().int().optional().describe("Position in the sidebar order — lower sorts first."),
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
        .from("domains")
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  // --- Contexts ---
  // GTD contexts as a standalone saved list, separate from tasks.context
  // (still a free-text field on the task itself) — lets a context exist
  // and be suggested before any task uses it.

  server.registerTool(
    "list_contexts",
    {
      title: "List contexts",
      description: "List Antoine's saved GTD contexts (e.g. Computer, Errands, Phone) — suggestions for a task's context field.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin.from("contexts").select("id, name").eq("user_id", userId).order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_context",
    {
      title: "Create context",
      description: "Save a new GTD context (e.g. \"Errands\", \"Deep Work\") so it's suggested on tasks before anything uses it.",
      inputSchema: { name: z.string().min(1) },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ name }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");

      const { data, error } = await admin
        .from("contexts")
        .insert({ user_id: userId, name: trimmed })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_context",
    {
      title: "Update context",
      description: "Rename an existing saved context.",
      inputSchema: { id: z.string().uuid(), name: z.string().min(1) },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, name }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name cannot be empty");

      const { data, error } = await admin
        .from("contexts")
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
    "delete_context",
    {
      title: "Delete context",
      description: "Permanently delete a saved context. Doesn't touch any task already using that context string — it just stops being suggested.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin.from("contexts").delete().eq("id", id).eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );
}
