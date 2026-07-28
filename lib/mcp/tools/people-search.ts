import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listGoogleCalendarEvents } from "@/lib/google-calendar/sync";
import { ok, fail, type AdminClient } from "@/lib/mcp/shared";

export function registerPeopleSearchTools(server: McpServer, admin: AdminClient, userId: string) {
  server.registerTool(
    "list_people",
    {
      title: "List people",
      description:
        "Antoine's people list (the lightweight person layer — not a CRM). Each person can have " +
        "tasks linked via tasks.person_id and agenda items matched by name.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("people")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_person",
    {
      title: "Create person",
      description: "Add a person (name + optional notes) to link tasks and agendas against.",
      inputSchema: {
        name: z.string().min(1),
        notes: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ name, notes }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");
      const { data, error } = await admin
        .from("people")
        .insert({ user_id: userId, name: trimmed, notes: notes?.trim() ? notes : null })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_person",
    {
      title: "Update person",
      description: "Rename a person or update their notes.",
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        notes: z.string().nullable().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, name, notes }) => {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) {
        const trimmed = name.trim();
        if (!trimmed) return fail("Name cannot be empty");
        updates.name = trimmed;
      }
      if (notes !== undefined) updates.notes = notes;
      const { data, error } = await admin
        .from("people")
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
    "delete_person",
    {
      title: "Delete person",
      description:
        "Move a person to trash (30-day recovery via restore_from_trash). Their linked tasks and " +
        "agenda items are untouched.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("people")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ trashed: id });
    },
  );

  server.registerTool(
    "search",
    {
      title: "Search everything",
      description:
        "Global search across Antoine's whole Life OS: tasks (including completed), projects, " +
        "knowledge library items, tickler notes, and agenda items. Case-insensitive substring " +
        "match on titles and body text; each bucket capped at 20.",
      inputSchema: {
        query: z.string().min(2).describe("Search text, at least 2 characters"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const like = `%${query.trim().replace(/[%_]/g, (c) => `\\${c}`)}%`;
      const [tasks, projects, knowledgeItems, ticklerItems, agendaItems] = await Promise.all([
        admin
          .from("tasks")
          .select(
            "id, title, notes, status, someday, waiting_for, domain_id, project_id, scheduled_date, due_date, completed_at",
          )
          .eq("user_id", userId)
          .is("deleted_at", null)
          .or(`title.ilike.${like},notes.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(20),
        admin
          .from("projects")
          .select("id, name, description, status, domain_id")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .or(`name.ilike.${like},description.ilike.${like},purpose.ilike.${like},outcome_vision.ilike.${like},brainstorm.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(20),
        admin
          .from("knowledge_items")
          .select("id, title, content, url, type, folder_id, project_id")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .or(`title.ilike.${like},content.ilike.${like}`)
          .order("updated_at", { ascending: false })
          .limit(20),
        admin
          .from("tickler_items")
          .select("id, note, revisit_date")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .ilike("note", like)
          .order("revisit_date")
          .limit(20),
        admin
          .from("agenda_items")
          .select("id, person_name, note, done")
          .eq("user_id", userId)
          .or(`person_name.ilike.${like},note.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      const firstError =
        tasks.error ?? projects.error ?? knowledgeItems.error ?? ticklerItems.error ?? agendaItems.error;
      if (firstError) return fail(firstError.message);
      return ok({
        tasks: tasks.data,
        projects: projects.data,
        knowledge_items: knowledgeItems.data,
        tickler_items: ticklerItems.data,
        agenda_items: agendaItems.data,
      });
    },
  );

  server.registerTool(
    "list_google_calendar_events",
    {
      title: "List Google Calendar events",
      description:
        "Antoine's real calendar events (from his connected Google Calendar accounts) in a date " +
        "range — the hard landscape around which tasks get planned. Excludes events that Life OS " +
        "itself pushed from time-blocked tasks (those are already visible as tasks).",
      inputSchema: {
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD, inclusive"),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD, inclusive"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ start_date, end_date }) => {
      if (start_date > end_date) return fail("start_date must be on or before end_date");
      const events = await listGoogleCalendarEvents(userId, start_date, end_date);
      if (events === null) {
        return fail("No Google Calendar connected — connect one in Settings first.");
      }
      return ok(events);
    },
  );
}
