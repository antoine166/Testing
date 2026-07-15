import type { ContentBlockParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MODEL = "claude-sonnet-5";

export const TOOLS: Tool[] = [
  {
    name: "create_task",
    description:
      "Create a new task for Antoine. Use this when he mentions something he needs to do " +
      "(e.g. 'remind me to call the dentist'). Leave domain_id unset to put it in the Inbox.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The task title" },
        domain_id: {
          type: "string",
          description: "Optional domain UUID from the context below. Omit to leave in Inbox.",
        },
        priority: { type: "string", enum: ["none", "low", "medium", "high"] },
        due_date: { type: "string", description: "Optional, format YYYY-MM-DD" },
        scheduled_date: { type: "string", description: "Optional, format YYYY-MM-DD" },
      },
      required: ["title"],
    },
  },
  {
    name: "log_habit",
    description:
      "Log that Antoine completed a habit today. Use this when he mentions doing a habit " +
      "(e.g. 'I meditated this morning', 'did my workout'). Match against the habit list below.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string", description: "The habit's UUID from the context below" },
      },
      required: ["habit_id"],
    },
  },
  {
    name: "update_task",
    description:
      "Update an existing task, referenced by its UUID from the context below. Use to mark it " +
      "done, reschedule it, clear a Waiting For (set waiting_for to false), move a Someday/Maybe " +
      "item back to active (set someday to false), or file it into a domain/project.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        status: { type: "string", enum: ["todo", "in_progress", "done"] },
        priority: { type: "string", enum: ["none", "low", "medium", "high"] },
        due_date: { type: "string", description: "Empty string clears it" },
        scheduled_date: { type: "string", description: "Empty string clears it" },
        someday: { type: "boolean" },
        waiting_for: { type: "boolean" },
        domain_id: { type: "string", description: "Empty string clears it" },
        project_id: { type: "string", description: "Empty string clears it" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "delete_task",
    description:
      "Move a task to Trash, referenced by its UUID. Only use when Antoine clearly wants it " +
      "removed, not just completed — completing should use update_task with status done instead.",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "update_project",
    description:
      "Update a project's status, domain, or parent project, referenced by its UUID from the " +
      "context below. Use to archive a completed project, mark one someday, reactivate a " +
      "someday project, or file it as a subproject of another project (parent_project_id). " +
      "Subprojects can only be one level deep and always take on their parent's domain.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        status: { type: "string", enum: ["active", "someday", "completed", "archived"] },
        domain_id: { type: "string" },
        parent_project_id: {
          type: "string",
          description:
            "UUID of another top-level project to nest this one under. Empty string clears it, " +
            "promoting it back to top-level.",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "create_project",
    description:
      "Create a new project when a next action implies a multi-step outcome that isn't tracked " +
      "yet (an 'embedded project'). Set parent_project_id to create it as a subproject of an " +
      "existing top-level project instead (e.g. 'packing' under 'Move to Atlanta') — it then " +
      "inherits that project's domain automatically. Subprojects can only be one level deep.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        domain_id: { type: "string" },
        parent_project_id: {
          type: "string",
          description: "UUID of a top-level project to nest this new project under, if any.",
        },
        description: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_project",
    description:
      "Move a project to Trash, referenced by its UUID from the context below — its subprojects " +
      "(if any) and all of their tasks go with it. Recoverable for 30 days from the app's Trash " +
      "page.",
    input_schema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
    },
  },
  {
    name: "create_domain",
    description: "Create a new top-level life domain (e.g. Health, Finance, Business).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        color: { type: "string", description: "Optional hex color, e.g. #3b82f6" },
        icon: { type: "string", description: "Optional emoji or icon name" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_domain",
    description: "Rename or recolor an existing domain, referenced by its UUID from the context below.",
    input_schema: {
      type: "object",
      properties: {
        domain_id: { type: "string" },
        name: { type: "string" },
        color: { type: "string", description: "Hex color, e.g. #3b82f6" },
        icon: { type: "string" },
      },
      required: ["domain_id"],
    },
  },
  {
    name: "create_routine",
    description:
      "Create a new routine — an ordered sequence of steps tied to a time of day, surfaced on " +
      "the Today view.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        time_of_day: { type: "string", enum: ["morning", "afternoon", "evening", "custom"] },
      },
      required: ["name"],
    },
  },
  {
    name: "update_routine",
    description:
      "Rename a routine, change its time of day, or pause it, referenced by its UUID from the " +
      "context below.",
    input_schema: {
      type: "object",
      properties: {
        routine_id: { type: "string" },
        name: { type: "string" },
        time_of_day: { type: "string", enum: ["morning", "afternoon", "evening", "custom"] },
        active: { type: "boolean", description: "Set false to pause it" },
      },
      required: ["routine_id"],
    },
  },
  {
    name: "delete_routine",
    description:
      "Move a routine (and its steps) to Trash, referenced by its UUID from the context below. " +
      "Recoverable for 30 days.",
    input_schema: {
      type: "object",
      properties: { routine_id: { type: "string" } },
      required: ["routine_id"],
    },
  },
  {
    name: "add_routine_item",
    description: "Append a new step to the end of an existing routine.",
    input_schema: {
      type: "object",
      properties: {
        routine_id: { type: "string", description: "The routine's UUID from the context below" },
        title: { type: "string" },
        duration_minutes: { type: "number" },
      },
      required: ["routine_id", "title"],
    },
  },
  {
    name: "create_checklist",
    description: "Create a new empty checklist (a reusable, resettable list — e.g. a packing list).",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "update_checklist",
    description: "Rename a checklist, referenced by its UUID from the context below.",
    input_schema: {
      type: "object",
      properties: { checklist_id: { type: "string" }, name: { type: "string" } },
      required: ["checklist_id", "name"],
    },
  },
  {
    name: "delete_checklist",
    description:
      "Move a checklist (and its items) to Trash, referenced by its UUID from the context below. " +
      "Recoverable for 30 days.",
    input_schema: {
      type: "object",
      properties: { checklist_id: { type: "string" } },
      required: ["checklist_id"],
    },
  },
  {
    name: "reset_checklist",
    description: "Uncheck every item on a checklist in one action, so it's ready to reuse.",
    input_schema: {
      type: "object",
      properties: { checklist_id: { type: "string" } },
      required: ["checklist_id"],
    },
  },
  {
    name: "add_checklist_item",
    description: "Append a new item to the end of an existing checklist.",
    input_schema: {
      type: "object",
      properties: {
        checklist_id: { type: "string", description: "The checklist's UUID from the context below" },
        title: { type: "string" },
      },
      required: ["checklist_id", "title"],
    },
  },
  {
    name: "create_knowledge_item",
    description:
      "Save a new note, article, book, quote, or resource to Antoine's knowledge library. Use " +
      "this when he mentions something worth keeping (e.g. a book recommendation, a link).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        url: { type: "string" },
        type: { type: "string", enum: ["note", "article", "book", "quote", "resource"] },
        tags: { type: "array", items: { type: "string" } },
        folder_id: { type: "string", description: "Optional folder UUID from the context below" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_knowledge_folder",
    description: "Create a new knowledge library folder, optionally nested inside another.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        parent_id: { type: "string", description: "Optional parent folder UUID from the context below" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_knowledge_folder",
    description:
      "Rename a knowledge library folder or move it under a different parent, referenced by its " +
      "UUID from the context below.",
    input_schema: {
      type: "object",
      properties: {
        folder_id: { type: "string" },
        name: { type: "string" },
        parent_id: { type: "string", description: "Empty string clears it (moves to top level)" },
      },
      required: ["folder_id"],
    },
  },
];

const BASE_SYSTEM =
  "You are Antoine's personal life coach inside his Life OS app, using the GTD (Getting Things " +
  "Done) methodology. You have read access to his domains, projects, tasks, habits, routines, " +
  "checklists, knowledge library folders, and today's check-in, given below. Give specific, " +
  "context-aware coaching grounded in this data — never generic advice. Keep replies " +
  "conversational and brief.\n\n" +
  "You can take actions via tools: create/update/delete tasks and projects (including " +
  "subprojects), create/update domains, log/track habits, create/update/delete routines and add " +
  "steps to them, create/update/delete/reset checklists and add items to them, and save/organize " +
  "knowledge library items and folders. Every tool call requires the user's explicit confirmation " +
  "before it runs — the app shows him exactly what you're proposing and he approves or declines " +
  "each one. So don't ask for confirmation in your own text, just call the tool when it's clearly " +
  "implied and let the app handle confirmation.\n\n" +
  "Some finer-grained actions (editing or deleting one routine step, one checklist item, or one " +
  "saved knowledge item) aren't available here — those go through the app directly or the Claude " +
  "connector (claude.ai / Claude Desktop), which can list existing items before acting on them. " +
  "Domain deletion and permanently purging trashed items (bypassing the 30-day recovery window) " +
  "are also app-only, deliberately kept out of your reach.";

const WEEKLY_REVIEW_SYSTEM =
  BASE_SYSTEM +
  "\n\nAntoine just clicked \"Start Weekly Review.\" Guide him through GTD's Weekly Review, one " +
  "section at a time, using the extra context below (stalled projects, Waiting For, Someday/Maybe, " +
  "open agenda items):\n\n" +
  "GET CLEAR — ask if anything is on his mind that isn't captured yet; help him capture it as a " +
  "task.\n" +
  "GET CURRENT — walk through, one at a time: stalled projects (each needs a next action — help " +
  "add one, or archive/someday it), Waiting For (anything to follow up on or that's actually " +
  "done), Someday/Maybe (anything that should become active now), open agenda items (anything to " +
  "convert into a task).\n" +
  "GET CREATIVE — ask if any new projects or ideas have come up that aren't captured yet.\n\n" +
  "Go section by section — don't dump everything at once. Wait for his response before moving to " +
  "the next section. Keep it conversational, not a robotic checklist recitation.";

export function systemPrompt(mode: string, context: string): string {
  return (mode === "weekly-review" ? WEEKLY_REVIEW_SYSTEM : BASE_SYSTEM) + "\n\n" + context;
}

export function extractText(content: ContentBlockParam[]): string {
  return content
    .filter((block): block is { type: "text"; text: string } & typeof block => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export async function buildContext(supabase: SupabaseClient, today: string, mode: string) {
  const [domainsRes, projectsRes, tasksRes, habitsRes, checkinRes, routinesRes, checklistsRes, foldersRes] =
    await Promise.all([
      supabase.from("domains").select("id, name"),
      supabase
        .from("projects")
        .select("id, name, status, parent_project_id")
        .neq("status", "archived"),
      supabase
        .from("tasks")
        .select(
          "id, title, status, priority, due_date, scheduled_date, someday, waiting_for, waiting_since, domain_id, project_id",
        )
        .is("deleted_at", null),
      supabase.from("habits").select("id, name, frequency, active").eq("active", true),
      supabase
        .from("daily_checkins")
        .select("energy_level, focus_level, notes")
        .eq("date", today)
        .maybeSingle(),
      supabase.from("routines").select("id, name, time_of_day, active").is("deleted_at", null),
      supabase.from("checklists").select("id, name").is("deleted_at", null),
      supabase.from("knowledge_folders").select("id, name"),
    ]);

  const domains = domainsRes.data ?? [];
  const projects = projectsRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const habits = habitsRes.data ?? [];
  const checkin = checkinRes.data;
  const routines = routinesRes.data ?? [];
  const checklists = checklistsRes.data ?? [];
  const knowledgeFolders = foldersRes.data ?? [];
  const openTasks = tasks.filter((t) => t.status !== "done");

  const lines: string[] = [];
  lines.push(`Today's date: ${today}`);

  lines.push("\nDomains:");
  lines.push(domains.length ? domains.map((d) => `- ${d.id} ${d.name}`).join("\n") : "(none yet)");

  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  lines.push("\nActive projects:");
  lines.push(
    projects.length
      ? projects
          .map(
            (p) =>
              `- ${p.id} ${p.name} (${p.status}${
                p.parent_project_id
                  ? `, subproject of ${projectNameById.get(p.parent_project_id) ?? p.parent_project_id}`
                  : ""
              })`,
          )
          .join("\n")
      : "(none)",
  );

  lines.push("\nOpen tasks (not done):");
  lines.push(
    openTasks.length
      ? openTasks
          .map(
            (t) =>
              `- ${t.id} "${t.title}" [${t.status}, ${t.priority} priority${
                t.scheduled_date ? `, scheduled ${t.scheduled_date}` : ""
              }${t.due_date ? `, due ${t.due_date}` : ""}${t.someday ? ", someday" : ""}${
                t.waiting_for ? `, waiting for since ${t.waiting_since}` : ""
              }]`,
          )
          .join("\n")
      : "(none)",
  );

  lines.push("\nActive habits:");
  lines.push(
    habits.length ? habits.map((h) => `- ${h.id} ${h.name} (${h.frequency})`).join("\n") : "(none)",
  );

  lines.push("\nRoutines:");
  lines.push(
    routines.length
      ? routines
          .map((r) => `- ${r.id} ${r.name} (${r.time_of_day}${r.active ? "" : ", paused"})`)
          .join("\n")
      : "(none)",
  );

  lines.push("\nChecklists:");
  lines.push(
    checklists.length ? checklists.map((c) => `- ${c.id} ${c.name}`).join("\n") : "(none)",
  );

  lines.push("\nKnowledge library folders:");
  lines.push(
    knowledgeFolders.length
      ? knowledgeFolders.map((f) => `- ${f.id} ${f.name}`).join("\n")
      : "(none)",
  );

  lines.push("\nToday's check-in:");
  lines.push(
    checkin
      ? `Energy ${checkin.energy_level}/5, focus ${checkin.focus_level}/5${
          checkin.notes ? ` — "${checkin.notes}"` : ""
        }`
      : "Not checked in yet today.",
  );

  if (mode !== "weekly-review") return lines.join("\n");

  const agendaRes = await supabase.from("agenda_items").select("person_name, note").eq("done", false);
  const agendaItems = agendaRes.data ?? [];

  const openTaskCountByProject = new Map<string, number>();
  for (const t of openTasks) {
    if (!t.project_id) continue;
    openTaskCountByProject.set(t.project_id, (openTaskCountByProject.get(t.project_id) ?? 0) + 1);
  }
  const subprojectsByParent = new Map<string, typeof projects>();
  for (const p of projects) {
    if (!p.parent_project_id) continue;
    if (!subprojectsByParent.has(p.parent_project_id)) subprojectsByParent.set(p.parent_project_id, []);
    subprojectsByParent.get(p.parent_project_id)!.push(p);
  }
  const stalledProjects = projects.filter((p) => {
    if (p.status !== "active") return false;
    const ownCount = openTaskCountByProject.get(p.id) ?? 0;
    const childCount = (subprojectsByParent.get(p.id) ?? []).reduce(
      (sum, child) => sum + (openTaskCountByProject.get(child.id) ?? 0),
      0,
    );
    return !ownCount && !childCount;
  });
  const waitingFor = openTasks.filter((t) => t.waiting_for);
  const somedayTasks = openTasks.filter((t) => t.someday);

  lines.push("\nStalled projects (active, zero open tasks):");
  lines.push(
    stalledProjects.length ? stalledProjects.map((p) => `- ${p.id} ${p.name}`).join("\n") : "(none)",
  );

  lines.push("\nWaiting For (delegated):");
  lines.push(
    waitingFor.length
      ? waitingFor
          .map((t) => `- ${t.id} "${t.title}" waiting since ${t.waiting_since}`)
          .join("\n")
      : "(none)",
  );

  lines.push("\nSomeday/Maybe:");
  lines.push(
    somedayTasks.length ? somedayTasks.map((t) => `- ${t.id} "${t.title}"`).join("\n") : "(none)",
  );

  lines.push("\nOpen agenda items (things to bring up with someone):");
  lines.push(
    agendaItems.length ? agendaItems.map((a) => `- ${a.person_name}: ${a.note}`).join("\n") : "(none)",
  );

  return lines.join("\n");
}

export async function executeTool(
  supabase: SupabaseClient,
  userId: string,
  today: string,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === "create_task") {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) return "Error: title is required";

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        title,
        domain_id: typeof input.domain_id === "string" ? input.domain_id : null,
        priority: typeof input.priority === "string" ? input.priority : undefined,
        due_date: typeof input.due_date === "string" ? input.due_date : undefined,
        scheduled_date: typeof input.scheduled_date === "string" ? input.scheduled_date : undefined,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created task "${data.title}" (${data.domain_id ? "processed" : "in Inbox"}).`;
  }

  if (name === "log_habit") {
    const habitId = typeof input.habit_id === "string" ? input.habit_id : "";
    if (!habitId) return "Error: habit_id is required";

    const { count } = await supabase
      .from("habit_logs")
      .select("id", { count: "exact", head: true })
      .eq("habit_id", habitId)
      .eq("logged_date", today);
    if ((count ?? 0) >= 7) return "Already logged 7 times today — that's the max.";

    const { error } = await supabase
      .from("habit_logs")
      .insert({ user_id: userId, habit_id: habitId, logged_date: today });

    if (error) return `Error: ${error.message}`;
    return "Logged.";
  }

  if (name === "update_task") {
    const taskId = typeof input.task_id === "string" ? input.task_id : "";
    if (!taskId) return "Error: task_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.status === "string") {
      updates.status = input.status;
      updates.completed_at = input.status === "done" ? new Date().toISOString() : null;
    }
    if (typeof input.priority === "string") updates.priority = input.priority;
    if (typeof input.due_date === "string") updates.due_date = input.due_date || null;
    if (typeof input.scheduled_date === "string") updates.scheduled_date = input.scheduled_date || null;
    if (typeof input.someday === "boolean") updates.someday = input.someday;
    if (typeof input.waiting_for === "boolean") {
      updates.waiting_for = input.waiting_for;
      updates.waiting_since = input.waiting_for ? today : null;
    }
    if (typeof input.domain_id === "string") updates.domain_id = input.domain_id || null;
    if (typeof input.project_id === "string") updates.project_id = input.project_id || null;

    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", taskId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated task "${data.title}".`;
  }

  if (name === "delete_task") {
    const taskId = typeof input.task_id === "string" ? input.task_id : "";
    if (!taskId) return "Error: task_id is required";

    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", taskId);

    if (error) return `Error: ${error.message}`;
    return "Moved to Trash.";
  }

  if (name === "update_project") {
    const projectId = typeof input.project_id === "string" ? input.project_id : "";
    if (!projectId) return "Error: project_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.status === "string") updates.status = input.status;
    if (typeof input.domain_id === "string") updates.domain_id = input.domain_id || null;
    if (typeof input.parent_project_id === "string") {
      updates.parent_project_id = input.parent_project_id || null;
    }

    const { data, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", projectId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated project "${data.name}".`;
  }

  if (name === "create_project") {
    const projectName = typeof input.name === "string" ? input.name.trim() : "";
    if (!projectName) return "Error: name is required";

    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        name: projectName,
        domain_id: typeof input.domain_id === "string" ? input.domain_id : null,
        parent_project_id:
          typeof input.parent_project_id === "string" ? input.parent_project_id : null,
        description: typeof input.description === "string" ? input.description : undefined,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created project "${data.name}".`;
  }

  if (name === "delete_project") {
    const projectId = typeof input.project_id === "string" ? input.project_id : "";
    if (!projectId) return "Error: project_id is required";

    const { error } = await supabase.rpc("trash_project", { p_project_id: projectId });

    if (error) return `Error: ${error.message}`;
    return "Moved to Trash (subprojects and their tasks went with it, if any).";
  }

  if (name === "create_domain") {
    const domainName = typeof input.name === "string" ? input.name.trim() : "";
    if (!domainName) return "Error: name is required";

    const { data, error } = await supabase
      .from("domains")
      .insert({
        user_id: userId,
        name: domainName,
        color: typeof input.color === "string" ? input.color : undefined,
        icon: typeof input.icon === "string" ? input.icon : undefined,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created domain "${data.name}".`;
  }

  if (name === "update_domain") {
    const domainId = typeof input.domain_id === "string" ? input.domain_id : "";
    if (!domainId) return "Error: domain_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.name === "string") updates.name = input.name.trim();
    if (typeof input.color === "string") updates.color = input.color;
    if (typeof input.icon === "string") updates.icon = input.icon;

    const { data, error } = await supabase
      .from("domains")
      .update(updates)
      .eq("id", domainId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated domain "${data.name}".`;
  }

  if (name === "create_routine") {
    const routineName = typeof input.name === "string" ? input.name.trim() : "";
    if (!routineName) return "Error: name is required";

    const { data, error } = await supabase
      .from("routines")
      .insert({
        user_id: userId,
        name: routineName,
        time_of_day: typeof input.time_of_day === "string" ? input.time_of_day : undefined,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created routine "${data.name}".`;
  }

  if (name === "update_routine") {
    const routineId = typeof input.routine_id === "string" ? input.routine_id : "";
    if (!routineId) return "Error: routine_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.name === "string") updates.name = input.name.trim();
    if (typeof input.time_of_day === "string") updates.time_of_day = input.time_of_day;
    if (typeof input.active === "boolean") updates.active = input.active;

    const { data, error } = await supabase
      .from("routines")
      .update(updates)
      .eq("id", routineId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated routine "${data.name}".`;
  }

  if (name === "delete_routine") {
    const routineId = typeof input.routine_id === "string" ? input.routine_id : "";
    if (!routineId) return "Error: routine_id is required";

    const { error } = await supabase
      .from("routines")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", routineId);

    if (error) return `Error: ${error.message}`;
    return "Moved to Trash.";
  }

  if (name === "add_routine_item") {
    const routineId = typeof input.routine_id === "string" ? input.routine_id : "";
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!routineId) return "Error: routine_id is required";
    if (!title) return "Error: title is required";

    const { data: last } = await supabase
      .from("routine_items")
      .select("sort_order")
      .eq("routine_id", routineId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("routine_items")
      .insert({
        user_id: userId,
        routine_id: routineId,
        title,
        duration_minutes:
          typeof input.duration_minutes === "number" ? input.duration_minutes : null,
        sort_order: last ? last.sort_order + 1 : 0,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Added "${data.title}" to the routine.`;
  }

  if (name === "create_checklist") {
    const checklistName = typeof input.name === "string" ? input.name.trim() : "";
    if (!checklistName) return "Error: name is required";

    const { data, error } = await supabase
      .from("checklists")
      .insert({ user_id: userId, name: checklistName })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created checklist "${data.name}".`;
  }

  if (name === "update_checklist") {
    const checklistId = typeof input.checklist_id === "string" ? input.checklist_id : "";
    const checklistName = typeof input.name === "string" ? input.name.trim() : "";
    if (!checklistId) return "Error: checklist_id is required";
    if (!checklistName) return "Error: name is required";

    const { data, error } = await supabase
      .from("checklists")
      .update({ name: checklistName })
      .eq("id", checklistId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Renamed checklist to "${data.name}".`;
  }

  if (name === "delete_checklist") {
    const checklistId = typeof input.checklist_id === "string" ? input.checklist_id : "";
    if (!checklistId) return "Error: checklist_id is required";

    const { error } = await supabase
      .from("checklists")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", checklistId);

    if (error) return `Error: ${error.message}`;
    return "Moved to Trash.";
  }

  if (name === "reset_checklist") {
    const checklistId = typeof input.checklist_id === "string" ? input.checklist_id : "";
    if (!checklistId) return "Error: checklist_id is required";

    const { error } = await supabase
      .from("checklist_items")
      .update({ checked: false })
      .eq("checklist_id", checklistId);

    if (error) return `Error: ${error.message}`;
    return "Checklist reset.";
  }

  if (name === "add_checklist_item") {
    const checklistId = typeof input.checklist_id === "string" ? input.checklist_id : "";
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!checklistId) return "Error: checklist_id is required";
    if (!title) return "Error: title is required";

    const { data: last } = await supabase
      .from("checklist_items")
      .select("sort_order")
      .eq("checklist_id", checklistId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("checklist_items")
      .insert({
        user_id: userId,
        checklist_id: checklistId,
        title,
        sort_order: last ? last.sort_order + 1 : 0,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Added "${data.title}" to the checklist.`;
  }

  if (name === "create_knowledge_item") {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) return "Error: title is required";

    const { data, error } = await supabase
      .from("knowledge_items")
      .insert({
        user_id: userId,
        title,
        content: typeof input.content === "string" ? input.content : undefined,
        url: typeof input.url === "string" ? input.url : undefined,
        type: typeof input.type === "string" ? input.type : undefined,
        tags: Array.isArray(input.tags) ? input.tags : null,
        folder_id: typeof input.folder_id === "string" ? input.folder_id : null,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Saved "${data.title}" to the knowledge library.`;
  }

  if (name === "create_knowledge_folder") {
    const folderName = typeof input.name === "string" ? input.name.trim() : "";
    if (!folderName) return "Error: name is required";

    const { data, error } = await supabase
      .from("knowledge_folders")
      .insert({
        user_id: userId,
        name: folderName,
        parent_id: typeof input.parent_id === "string" ? input.parent_id : null,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created folder "${data.name}".`;
  }

  if (name === "update_knowledge_folder") {
    const folderId = typeof input.folder_id === "string" ? input.folder_id : "";
    if (!folderId) return "Error: folder_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.name === "string") updates.name = input.name.trim();
    if (typeof input.parent_id === "string") updates.parent_id = input.parent_id || null;

    const { data, error } = await supabase
      .from("knowledge_folders")
      .update(updates)
      .eq("id", folderId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated folder "${data.name}".`;
  }

  return `Error: unknown tool ${name}`;
}
