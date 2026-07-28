import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok, fail, KNOWLEDGE_TYPES, type AdminClient } from "@/lib/mcp/shared";

export function registerKnowledgeTools(server: McpServer, admin: AdminClient, userId: string) {
  // --- Knowledge library ---

  server.registerTool(
    "list_knowledge_items",
    {
      title: "List knowledge library items",
      description: "List Antoine's saved notes, articles, books, quotes, and resources.",
      inputSchema: {
        type: z.enum(KNOWLEDGE_TYPES).optional(),
        folder_id: z.string().uuid().optional(),
        tag: z.string().optional().describe("Only return items with this tag"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ type, folder_id, tag }) => {
      let query = admin.from("knowledge_items").select("*").eq("user_id", userId).is("deleted_at", null);
      if (type) query = query.eq("type", type);
      if (folder_id) query = query.eq("folder_id", folder_id);
      if (tag) query = query.contains("tags", [tag]);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_knowledge_item",
    {
      title: "Create knowledge library item",
      description: "Save a new note, article, book, quote, or resource to Antoine's knowledge library.",
      inputSchema: {
        title: z.string().min(1),
        content: z.string().optional(),
        url: z.string().optional(),
        type: z.enum(KNOWLEDGE_TYPES).optional().describe("Defaults to note"),
        tags: z.array(z.string()).optional(),
        folder_id: z.string().uuid().optional(),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("Attach as a project's support material — shown in that project's Reference section"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ title, content, url, type, tags, folder_id, project_id }) => {
      const trimmed = title.trim();
      if (!trimmed) return fail("Title is required");

      const { data, error } = await admin
        .from("knowledge_items")
        .insert({
          user_id: userId,
          title: trimmed,
          content,
          url,
          type,
          tags: tags ?? null,
          folder_id: folder_id ?? null,
          project_id: project_id ?? null,
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_knowledge_item",
    {
      title: "Update knowledge library item",
      description: "Update an existing knowledge library item.",
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        content: z.string().optional(),
        url: z.string().nullable().optional(),
        type: z.enum(KNOWLEDGE_TYPES).optional(),
        tags: z.array(z.string()).nullable().optional(),
        folder_id: z.string().uuid().nullable().optional(),
        project_id: z
          .string()
          .uuid()
          .nullable()
          .optional()
          .describe("Attach to a project's Reference section, or null to detach"),
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
        .from("knowledge_items")
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
    "delete_knowledge_item",
    {
      title: "Delete knowledge library item",
      description: "Move a knowledge library item to trash. Recoverable for 30 days.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("knowledge_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  server.registerTool(
    "list_knowledge_folders",
    {
      title: "List knowledge library folders",
      description: "List Antoine's knowledge library folders (nested, like folders on a computer).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("knowledge_folders")
        .select("*")
        .eq("user_id", userId)
        .order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_knowledge_folder",
    {
      title: "Create knowledge library folder",
      description: "Create a new knowledge library folder, optionally nested inside another.",
      inputSchema: {
        name: z.string().min(1),
        parent_id: z.string().uuid().optional().describe("UUID of a parent folder, for nesting"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ name, parent_id }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");

      const { data, error } = await admin
        .from("knowledge_folders")
        .insert({ user_id: userId, name: trimmed, parent_id: parent_id ?? null })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_knowledge_folder",
    {
      title: "Rename or move knowledge library folder",
      description:
        "Rename a knowledge library folder or move it under a different parent. Folder deletion " +
        "isn't exposed here — it's a permanent, non-recoverable action, so that stays app-only.",
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        parent_id: z.string().uuid().nullable().optional(),
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
        .from("knowledge_folders")
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );
}
