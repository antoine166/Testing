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
      "done, reschedule it, clear a Waiting For (set waiting_on to an empty string), move a " +
      "Someday/Maybe item back to active (set someday to false), or file it into a domain/project.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        status: { type: "string", enum: ["todo", "in_progress", "done"] },
        priority: { type: "string", enum: ["none", "low", "medium", "high"] },
        due_date: { type: "string", description: "Empty string clears it" },
        scheduled_date: { type: "string", description: "Empty string clears it" },
        someday: { type: "boolean" },
        waiting_on: { type: "string", description: "Empty string clears it" },
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
      "Update a project's status or domain, referenced by its UUID from the context below. Use " +
      "to archive a completed project, mark one someday, or reactivate a someday project.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        status: { type: "string", enum: ["active", "someday", "completed", "archived"] },
        domain_id: { type: "string" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "create_project",
    description:
      "Create a new project when a next action implies a multi-step outcome that isn't tracked " +
      "yet (an 'embedded project').",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        domain_id: { type: "string" },
        description: { type: "string" },
      },
      required: ["name"],
    },
  },
];

const BASE_SYSTEM =
  "You are Antoine's personal life coach inside his Life OS app, using the GTD (Getting Things " +
  "Done) methodology. You have read access to his tasks, projects, habits, and today's check-in, " +
  "given below. Give specific, context-aware coaching grounded in this data — never generic " +
  "advice. Keep replies conversational and brief.\n\n" +
  "You can take actions via tools: create/update/delete tasks, create/update projects, and log " +
  "habits. Every tool call requires the user's explicit confirmation before it runs — the app " +
  "shows him exactly what you're proposing and he approves or declines each one. So don't ask for " +
  "confirmation in your own text, just call the tool when it's clearly implied and let the app " +
  "handle confirmation.";

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
  const [domainsRes, projectsRes, tasksRes, habitsRes, checkinRes] = await Promise.all([
    supabase.from("domains").select("id, name"),
    supabase.from("projects").select("id, name, status").neq("status", "archived"),
    supabase
      .from("tasks")
      .select(
        "id, title, status, priority, due_date, scheduled_date, someday, waiting_on, waiting_since, domain_id, project_id",
      )
      .is("deleted_at", null),
    supabase.from("habits").select("id, name, frequency, active").eq("active", true),
    supabase
      .from("daily_checkins")
      .select("energy_level, focus_level, notes")
      .eq("date", today)
      .maybeSingle(),
  ]);

  const domains = domainsRes.data ?? [];
  const projects = projectsRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const habits = habitsRes.data ?? [];
  const checkin = checkinRes.data;
  const openTasks = tasks.filter((t) => t.status !== "done");

  const lines: string[] = [];
  lines.push(`Today's date: ${today}`);

  lines.push("\nDomains:");
  lines.push(domains.length ? domains.map((d) => `- ${d.id} ${d.name}`).join("\n") : "(none yet)");

  lines.push("\nActive projects:");
  lines.push(
    projects.length ? projects.map((p) => `- ${p.id} ${p.name} (${p.status})`).join("\n") : "(none)",
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
                t.waiting_on ? `, waiting on ${t.waiting_on} since ${t.waiting_since}` : ""
              }]`,
          )
          .join("\n")
      : "(none)",
  );

  lines.push("\nActive habits:");
  lines.push(
    habits.length ? habits.map((h) => `- ${h.id} ${h.name} (${h.frequency})`).join("\n") : "(none)",
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
  const stalledProjects = projects.filter(
    (p) => p.status === "active" && !(openTaskCountByProject.get(p.id) ?? 0),
  );
  const waitingFor = openTasks.filter((t) => t.waiting_on);
  const somedayTasks = openTasks.filter((t) => t.someday);

  lines.push("\nStalled projects (active, zero open tasks):");
  lines.push(
    stalledProjects.length ? stalledProjects.map((p) => `- ${p.id} ${p.name}`).join("\n") : "(none)",
  );

  lines.push("\nWaiting For (delegated):");
  lines.push(
    waitingFor.length
      ? waitingFor
          .map((t) => `- ${t.id} "${t.title}" waiting on ${t.waiting_on} since ${t.waiting_since}`)
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

    const { error } = await supabase
      .from("habit_logs")
      .insert({ user_id: userId, habit_id: habitId, logged_date: today });

    if (error) {
      if (error.code === "23505") return "That habit is already logged for today.";
      return `Error: ${error.message}`;
    }
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
    if (typeof input.waiting_on === "string") {
      updates.waiting_on = input.waiting_on || null;
      updates.waiting_since = input.waiting_on ? today : null;
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
        description: typeof input.description === "string" ? input.description : undefined,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created project "${data.name}".`;
  }

  return `Error: unknown tool ${name}`;
}
