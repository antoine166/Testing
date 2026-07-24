import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { syncTaskCalendarEvent } from "@/lib/google-calendar/sync";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GTD's "turns out this needs more than one step" move: creates a project
 * from a task's title/notes/domain/priority/dates/link, then trashes the
 * original task (recoverable for 30 days like any other trashed task).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // A project needs a domain to be visible in the sidebar. Take it from the
  // request (the Clarify flow asks for one), falling back to the task's own
  // domain; refuse to create an orphaned, domain-less project.
  const domainId =
    typeof body.domain_id === "string" && body.domain_id ? body.domain_id : task.domain_id;
  if (!domainId) {
    return NextResponse.json({ error: "Pick a domain for the project." }, { status: 400 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: task.title,
      description: task.notes,
      domain_id: domainId,
      priority: task.priority,
      due_date: task.due_date,
      scheduled_date: task.scheduled_date,
      link: task.link,
    })
    .select()
    .single();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  const { error: trashError } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (trashError) {
    // Project was created but the task wasn't trashed — surface both so
    // nothing silently duplicates or goes missing.
    return NextResponse.json(
      { error: `Project created but couldn't trash the original task: ${trashError.message}`, project },
      { status: 500 },
    );
  }

  await syncTaskCalendarEvent(user.id, id);

  return NextResponse.json(project, { status: 201 });
}
