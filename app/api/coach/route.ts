import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { requireUser } from "@/lib/supabase/require-user";
import type { SupabaseClient } from "@supabase/supabase-js";

const MODEL = "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 5;

const TOOLS: Tool[] = [
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
];

async function buildContext(supabase: SupabaseClient, today: string) {
  const [domainsRes, projectsRes, tasksRes, habitsRes, checkinRes] = await Promise.all([
    supabase.from("domains").select("id, name"),
    supabase.from("projects").select("id, name, status").neq("status", "archived"),
    supabase.from("tasks").select("title, status, priority, due_date, scheduled_date").neq("status", "done"),
    supabase.from("habits").select("id, name, frequency, active").eq("active", true),
    supabase.from("daily_checkins").select("energy_level, focus_level, notes").eq("date", today).maybeSingle(),
  ]);

  const domains = domainsRes.data ?? [];
  const projects = projectsRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const habits = habitsRes.data ?? [];
  const checkin = checkinRes.data;

  const lines: string[] = [];
  lines.push(`Today's date: ${today}`);

  lines.push("\nDomains:");
  lines.push(
    domains.length
      ? domains.map((d) => `- ${d.id} ${d.name}`).join("\n")
      : "(none yet)",
  );

  lines.push("\nActive projects:");
  lines.push(
    projects.length
      ? projects.map((p) => `- ${p.name} (${p.status})`).join("\n")
      : "(none)",
  );

  lines.push("\nOpen tasks (not done):");
  lines.push(
    tasks.length
      ? tasks
          .map(
            (t) =>
              `- ${t.title} [${t.status}, ${t.priority} priority${
                t.scheduled_date ? `, scheduled ${t.scheduled_date}` : ""
              }${t.due_date ? `, due ${t.due_date}` : ""}]`,
          )
          .join("\n")
      : "(none)",
  );

  lines.push("\nActive habits:");
  lines.push(
    habits.length
      ? habits.map((h) => `- ${h.id} ${h.name} (${h.frequency})`).join("\n")
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

  return lines.join("\n");
}

async function executeTool(
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
        scheduled_date:
          typeof input.scheduled_date === "string" ? input.scheduled_date : undefined,
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

  return `Error: unknown tool ${name}`;
}

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Coach isn't configured yet — ANTHROPIC_API_KEY is missing." },
      { status: 503 },
    );
  }

  const body = await request.json();
  const userMessages = Array.isArray(body.messages) ? body.messages : [];
  const today = typeof body.today === "string" ? body.today : new Date().toISOString().slice(0, 10);

  if (userMessages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  const context = await buildContext(supabase, today);
  const system =
    "You are Antoine's personal life coach inside his Life OS app. You have read access to " +
    "his tasks, projects, habits, and today's check-in, given below. Give specific, " +
    "context-aware coaching grounded in this data — never generic advice. Keep replies " +
    "conversational and brief.\n\n" +
    "You can also create a task or log a habit as done today via tools, when the " +
    "conversation clearly implies it. Don't ask for confirmation first — just do it, and " +
    "say what you did in your reply. You cannot edit, delete, or do anything else.\n\n" +
    context;

  const messages: MessageParam[] = userMessages;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages,
      tools: TOOLS,
    });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      return NextResponse.json({ reply: text });
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const result = await executeTool(
        supabase,
        user.id,
        today,
        block.name,
        block.input as Record<string, unknown>,
      );
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return NextResponse.json({ reply: "Sorry, I got stuck. Try rephrasing that?" });
}
