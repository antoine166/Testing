import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("project_templates")
    .select("*, project_template_tasks(*)")
    .order("name")
    .order("sort_order", { referencedTable: "project_template_tasks" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// Two creation modes:
//  - { from_project_id, name? } — snapshot an existing project and its open
//    tasks (the common path: build one real project, then "Save as template")
//  - { name, tasks?: [...], ...fields } — define a template from scratch
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  let templateFields: Record<string, unknown>;
  let taskRows: Record<string, unknown>[];

  if (typeof body.from_project_id === "string") {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("name, description, purpose, outcome_vision, brainstorm, link, domain_id, priority")
      .eq("id", body.from_project_id)
      .is("deleted_at", null)
      .single();
    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("title, notes, context, link, priority, created_at")
      .eq("project_id", body.from_project_id)
      .is("deleted_at", null)
      .neq("status", "done")
      .order("created_at");
    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 500 });
    }

    templateFields = {
      ...project,
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : project.name,
    };
    taskRows = (tasks ?? []).map((t, i) => ({
      title: t.title,
      notes: t.notes,
      context: t.context,
      link: t.link,
      priority: t.priority,
      sort_order: i,
    }));
  } else {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    templateFields = {
      name,
      description: typeof body.description === "string" ? body.description : undefined,
      purpose: typeof body.purpose === "string" ? body.purpose : undefined,
      outcome_vision: typeof body.outcome_vision === "string" ? body.outcome_vision : undefined,
      brainstorm: typeof body.brainstorm === "string" ? body.brainstorm : undefined,
      link: typeof body.link === "string" && body.link.trim() ? body.link.trim() : undefined,
      domain_id: typeof body.domain_id === "string" ? body.domain_id : null,
      priority: typeof body.priority === "string" ? body.priority : undefined,
    };
    taskRows = Array.isArray(body.tasks)
      ? body.tasks
          .filter((t: unknown) => t && typeof (t as { title?: unknown }).title === "string")
          .map((t: { title: string; notes?: string; context?: string; link?: string; priority?: string }, i: number) => ({
            title: t.title.trim(),
            notes: typeof t.notes === "string" ? t.notes : null,
            context: typeof t.context === "string" ? t.context : null,
            link: typeof t.link === "string" ? t.link : null,
            priority: typeof t.priority === "string" ? t.priority : "none",
            sort_order: i,
          }))
          .filter((t: { title: string }) => t.title)
      : [];
  }

  const { data: template, error } = await supabase
    .from("project_templates")
    .insert({ ...templateFields, user_id: user.id })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (taskRows.length > 0) {
    const { error: tasksError } = await supabase.from("project_template_tasks").insert(
      taskRows.map((t) => ({ ...t, user_id: user.id, template_id: template.id })),
    );
    if (tasksError) {
      // Leave the template usable rather than half-rolling-back — the user
      // sees it has no tasks and can delete/recreate.
      return NextResponse.json(
        { error: `Template created but its tasks failed: ${tasksError.message}`, template },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ...template, task_count: taskRows.length }, { status: 201 });
}
