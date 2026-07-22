import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

type RouteParams = { params: Promise<{ id: string }> };

// Create a real project (plus its starter tasks) from a template.
// Optional overrides: name (defaults to the template's) and domain_id
// (defaults to the template's — pass explicitly to file it elsewhere).
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const { data: template, error: templateError } = await supabase
    .from("project_templates")
    .select("*, project_template_tasks(*)")
    .eq("id", id)
    .order("sort_order", { referencedTable: "project_template_tasks" })
    .single();
  if (templateError || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name:
        typeof body.name === "string" && body.name.trim() ? body.name.trim() : template.name,
      description: template.description,
      purpose: template.purpose,
      outcome_vision: template.outcome_vision,
      brainstorm: template.brainstorm,
      link: template.link,
      domain_id: typeof body.domain_id === "string" ? body.domain_id : template.domain_id,
      priority: template.priority,
    })
    .select()
    .single();
  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  const templateTasks = template.project_template_tasks ?? [];
  if (templateTasks.length > 0) {
    const { error: tasksError } = await supabase.from("tasks").insert(
      templateTasks.map(
        (t: { title: string; notes: string | null; context: string | null; link: string | null; priority: string }) => ({
          user_id: user.id,
          project_id: project.id,
          domain_id: project.domain_id,
          title: t.title,
          notes: t.notes,
          context: t.context,
          link: t.link,
          priority: t.priority,
        }),
      ),
    );
    if (tasksError) {
      return NextResponse.json(
        { error: `Project created but its tasks failed: ${tasksError.message}`, project },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { ...project, task_count: templateTasks.length },
    { status: 201 },
  );
}
