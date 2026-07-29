import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { syncTaskCalendarEvents, findCalendarAffectedTaskIds } from "@/lib/google-calendar/sync";
import { ok, fail, TASK_PRIORITIES, PROJECT_STATUSES, type AdminClient } from "@/lib/mcp/shared";

export function registerProjectTools(server: McpServer, admin: AdminClient, userId: string) {
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List Antoine's projects, optionally scoped to one domain.",
      inputSchema: { domain_id: z.string().uuid().optional().describe("Only return projects in this domain") },
      annotations: { readOnlyHint: true },
    },
    async ({ domain_id }) => {
      let query = admin
        .from("projects")
        .select(
          "id, name, description, domain_id, parent_project_id, status, priority, due_date, scheduled_date, link, completed_at",
        )
        .eq("user_id", userId)
        .is("deleted_at", null);
      if (domain_id) query = query.eq("domain_id", domain_id);
      const { data, error } = await query.order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "list_project_templates",
    {
      title: "List project templates",
      description:
        "Antoine's reusable project templates (name, fields, and starter tasks). Instantiate one " +
        "with instantiate_project_template to create a real project from it.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("project_templates")
        .select("*, project_template_tasks(*)")
        .eq("user_id", userId)
        .order("name")
        .order("sort_order", { referencedTable: "project_template_tasks" });
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_project_template",
    {
      title: "Create project template",
      description:
        "Create a reusable project template — either snapshot an existing project and its open " +
        "tasks (pass from_project_id), or define one from scratch (pass name and optionally tasks). " +
        "Templates are date-free by design: shape, not schedule.",
      inputSchema: {
        from_project_id: z.string().uuid().optional().describe("Snapshot this project + its open tasks"),
        name: z.string().min(1).optional().describe("Template name (required unless from_project_id, where it defaults to the project's name)"),
        description: z.string().optional(),
        purpose: z.string().optional(),
        outcome_vision: z.string().optional(),
        brainstorm: z.string().optional(),
        link: z.string().optional(),
        domain_id: z.string().uuid().optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        tasks: z
          .array(
            z.object({
              title: z.string().min(1),
              notes: z.string().optional(),
              context: z.string().optional(),
              link: z.string().optional(),
              priority: z.enum(TASK_PRIORITIES).optional(),
            }),
          )
          .optional()
          .describe("Starter tasks, in order (ignored when from_project_id is set)"),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ from_project_id, name, description, purpose, outcome_vision, brainstorm, link, domain_id, priority, tasks }) => {
      let fields: Record<string, unknown>;
      let taskRows: Record<string, unknown>[];

      if (from_project_id) {
        const { data: project, error: projectError } = await admin
          .from("projects")
          .select("name, description, purpose, outcome_vision, brainstorm, link, domain_id, priority")
          .eq("id", from_project_id)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .single();
        if (projectError || !project) return fail("Project not found");
        const { data: projectTasks, error: tasksError } = await admin
          .from("tasks")
          .select("title, notes, context, link, priority")
          .eq("project_id", from_project_id)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .neq("status", "done")
          .order("created_at");
        if (tasksError) return fail(tasksError.message);
        fields = { ...project, name: name?.trim() || project.name };
        taskRows = (projectTasks ?? []).map((t, i) => ({ ...t, sort_order: i }));
      } else {
        if (!name?.trim()) return fail("name is required when from_project_id isn't set");
        fields = {
          name: name.trim(),
          description,
          purpose,
          outcome_vision,
          brainstorm,
          link,
          domain_id: domain_id ?? null,
          priority,
        };
        taskRows = (tasks ?? []).map((t, i) => ({
          title: t.title.trim(),
          notes: t.notes ?? null,
          context: t.context ?? null,
          link: t.link ?? null,
          priority: t.priority ?? "none",
          sort_order: i,
        }));
      }

      const { data: template, error } = await admin
        .from("project_templates")
        .insert({ ...fields, user_id: userId })
        .select()
        .single();
      if (error) return fail(error.message);

      if (taskRows.length > 0) {
        const { error: insertError } = await admin.from("project_template_tasks").insert(
          taskRows.map((t) => ({ ...t, user_id: userId, template_id: template.id })),
        );
        if (insertError) return fail(`Template created but its tasks failed: ${insertError.message}`);
      }
      return ok({ ...template, task_count: taskRows.length });
    },
  );

  server.registerTool(
    "instantiate_project_template",
    {
      title: "Create project from template",
      description:
        "Create a real project (plus its starter tasks) from a template. Optional name and " +
        "domain_id override the template's defaults.",
      inputSchema: {
        template_id: z.string().uuid(),
        name: z.string().min(1).optional(),
        domain_id: z.string().uuid().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ template_id, name, domain_id }) => {
      const { data: template, error: templateError } = await admin
        .from("project_templates")
        .select("*, project_template_tasks(*)")
        .eq("id", template_id)
        .eq("user_id", userId)
        .order("sort_order", { referencedTable: "project_template_tasks" })
        .single();
      if (templateError || !template) return fail("Template not found");

      const { data: project, error: projectError } = await admin
        .from("projects")
        .insert({
          user_id: userId,
          name: name?.trim() || template.name,
          description: template.description,
          purpose: template.purpose,
          outcome_vision: template.outcome_vision,
          brainstorm: template.brainstorm,
          link: template.link,
          domain_id: domain_id ?? template.domain_id,
          priority: template.priority,
        })
        .select()
        .single();
      if (projectError) return fail(projectError.message);

      const templateTasks = template.project_template_tasks ?? [];
      if (templateTasks.length > 0) {
        const { error: tasksError } = await admin.from("tasks").insert(
          templateTasks.map((t: { title: string; notes: string | null; context: string | null; link: string | null; priority: string }) => ({
            user_id: userId,
            project_id: project.id,
            domain_id: project.domain_id,
            title: t.title,
            notes: t.notes,
            context: t.context,
            link: t.link,
            priority: t.priority,
          })),
        );
        if (tasksError) return fail(`Project created but its tasks failed: ${tasksError.message}`);
      }
      return ok({ ...project, task_count: templateTasks.length });
    },
  );

  server.registerTool(
    "update_project_template",
    {
      title: "Update project template",
      description: "Rename a project template or update its project-level fields.",
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        purpose: z.string().nullable().optional(),
        outcome_vision: z.string().nullable().optional(),
        brainstorm: z.string().nullable().optional(),
        link: z.string().nullable().optional(),
        domain_id: z.string().uuid().nullable().optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, ...rest }) => {
      const updates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) updates[key] = value;
      }
      if (typeof updates.name === "string") updates.name = updates.name.trim();
      const { data, error } = await admin
        .from("project_templates")
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
    "delete_project_template",
    {
      title: "Delete project template",
      description:
        "Permanently delete a project template (not trash-backed — same as recurring task " +
        "templates). Projects already created from it are unaffected.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("project_templates")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  server.registerTool(
    "create_project",
    {
      title: "Create project",
      description:
        "Create a new project. Set parent_project_id to create it as a subproject of an " +
        "existing top-level project instead (e.g. \"Packing\" under \"Move to Atlanta\") — it " +
        "then inherits that project's domain automatically. Subprojects can only be one level deep.",
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        purpose: z.string().optional().describe("GTD Natural Planning Model — why this project matters."),
        outcome_vision: z
          .string()
          .optional()
          .describe("GTD Natural Planning Model — what \"done\" looks like."),
        brainstorm: z
          .string()
          .optional()
          .describe("GTD Natural Planning Model — ideas, approaches, things to consider."),
        domain_id: z
          .string()
          .uuid()
          .optional()
          .describe("The domain this project lives under — required unless parent_project_id is set (subprojects inherit the parent's domain). A project needs a domain to be visible in the sidebar."),
        parent_project_id: z
          .string()
          .uuid()
          .optional()
          .describe("UUID of a top-level project to nest this new project under, if any."),
        status: z.enum(PROJECT_STATUSES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        due_date: z.string().optional().describe("YYYY-MM-DD"),
        scheduled_date: z.string().optional().describe("YYYY-MM-DD"),
        link: z.string().optional().describe("A related URL, e.g. a shared doc or spec."),
        review_every_days: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Review cadence in days — how often this project needs a look in the Weekly Review. Omit for due at every review (the default).",
          ),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({
      name,
      description,
      purpose,
      outcome_vision,
      brainstorm,
      domain_id,
      parent_project_id,
      status,
      priority,
      due_date,
      scheduled_date,
      link,
      review_every_days,
    }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");
      // A top-level project must have a domain or it's invisible in the
      // sidebar; subprojects inherit their parent's.
      if (!domain_id && !parent_project_id) {
        return fail("Pick a domain for the project (domain_id) — it needs one to show in the sidebar.");
      }

      const { data, error } = await admin
        .from("projects")
        .insert({
          user_id: userId,
          name: trimmed,
          description,
          purpose,
          outcome_vision,
          brainstorm,
          domain_id: domain_id ?? null,
          parent_project_id: parent_project_id ?? null,
          status,
          priority,
          due_date,
          scheduled_date,
          link: link && link.trim() ? link.trim() : undefined,
          review_every_days,
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_project",
    {
      title: "Update project",
      description:
        "Update a project's name, description, status, domain, or parent project. Use " +
        "parent_project_id to file it as a subproject of another top-level project; pass null " +
        "to clear it and promote it back to top-level (an empty string is not accepted — it's " +
        "not a valid UUID). Subprojects always take on their parent's domain.",
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        purpose: z
          .string()
          .optional()
          .describe("GTD Natural Planning Model — why this project matters. Empty string clears it."),
        outcome_vision: z
          .string()
          .optional()
          .describe("GTD Natural Planning Model — what \"done\" looks like. Empty string clears it."),
        brainstorm: z
          .string()
          .optional()
          .describe(
            "GTD Natural Planning Model — ideas, approaches, things to consider. Empty string clears it.",
          ),
        domain_id: z.string().uuid().nullable().optional(),
        parent_project_id: z.string().uuid().nullable().optional(),
        status: z.enum(PROJECT_STATUSES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        due_date: z.string().nullable().optional().describe("YYYY-MM-DD or null to clear"),
        scheduled_date: z.string().nullable().optional().describe("YYYY-MM-DD or null to clear"),
        link: z.string().nullable().optional().describe("Related URL, or null to clear."),
        review_every_days: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe(
            "Review cadence in days — how often this project needs a look in the Weekly Review. null = due at every review (the default).",
          ),
        mark_reviewed: z
          .boolean()
          .optional()
          .describe("true stamps last_reviewed_at = now, marking the project reviewed."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, name, link, mark_reviewed, ...rest }) => {
      const updates: Record<string, unknown> = { ...rest };
      if (name !== undefined) {
        const trimmed = name.trim();
        if (!trimmed) return fail("Name cannot be empty");
        updates.name = trimmed;
      }
      if (link !== undefined) {
        updates.link = link && link.trim() ? link.trim() : null;
      }
      if (mark_reviewed === true) {
        updates.last_reviewed_at = new Date().toISOString();
      }

      // Same completed_at stamping as the app's PUT /api/projects/[id]:
      // status → completed stamps it (if not already completed); any other
      // status clears it. Keep the two in sync.
      if (typeof updates.status === "string") {
        if (updates.status === "completed") {
          const { data: existing } = await admin
            .from("projects")
            .select("status")
            .eq("id", id)
            .eq("user_id", userId)
            .single();
          if (existing?.status !== "completed") {
            updates.completed_at = new Date().toISOString();
          }
        } else {
          updates.completed_at = null;
        }
      }

      const { data, error } = await admin
        .from("projects")
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
    "delete_project",
    {
      title: "Delete project",
      description:
        "Move a project to trash, along with its subprojects (if any) and all of their tasks. " +
        "Recoverable for 30 days from the app's Trash page.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { data: children, error: childrenError } = await admin
        .from("projects")
        .select("id")
        .eq("parent_project_id", id)
        .eq("user_id", userId)
        .is("deleted_at", null);
      if (childrenError) return fail(childrenError.message);

      // Same trash_project() RPC the app and Coach use — it defaults its
      // p_user_id parameter to auth.uid(), which isn't available to this
      // service-role client, so it's passed explicitly here.
      const { error } = await admin.rpc("trash_project", { p_project_id: id, p_user_id: userId });
      if (error) return fail(error.message);

      // The cascade just trashed the project's (and subprojects') tasks —
      // remove any Google Calendar events pushed for time-blocked ones.
      await syncTaskCalendarEvents(userId, await findCalendarAffectedTaskIds(userId, { projectId: id }));

      return ok({ deleted: id, subprojects_deleted: children.map((c) => c.id) });
    },
  );
}
