import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { seedCompletionTemplate, topUpTemplate, type StoredTemplate } from "@/lib/recurring-tasks/topup";
import { parseEnds, parseRecurrencePattern } from "@/lib/recurring-tasks/validate";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * The recurring-task mirror of convert-to-project: creates a recurring task
 * template from a plain task's title/notes/domain/project/priority/link and
 * its Context trio (context/estimated_minutes/energy_level),
 * generates its first occurrence(s), then trashes the original task
 * (recoverable for 30 days) — the new series' first occurrence stands in
 * for it. Things 3's "Repeat..." on any to-do is the reference point; this
 * app pre-generates occurrences ahead of time rather than editing a single
 * to-do in place, so "make recurring" has to create a new template instead.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (task.recurring_template_id) {
    return NextResponse.json({ error: "This task is already part of a recurring series" }, { status: 400 });
  }

  const body = await request.json();
  const patternResult = parseRecurrencePattern(body);
  if ("error" in patternResult) {
    return NextResponse.json({ error: patternResult.error }, { status: 400 });
  }
  const endsResult = parseEnds(body);
  if ("error" in endsResult) {
    return NextResponse.json({ error: endsResult.error }, { status: 400 });
  }

  const { data: template, error: templateError } = await supabase
    .from("recurring_task_templates")
    .insert({
      user_id: user.id,
      title: task.title,
      notes: task.notes,
      link: task.link,
      domain_id: task.domain_id,
      project_id: task.project_id,
      priority: task.priority,
      context: task.context,
      estimated_minutes: task.estimated_minutes,
      energy_level: task.energy_level,
      ...patternResult.pattern,
      ...endsResult.ends,
    })
    .select()
    .single();

  if (templateError) {
    return NextResponse.json({ error: templateError.message }, { status: 500 });
  }

  const stored = template as StoredTemplate;
  const { error: generateError } =
    stored.recurrence_type === "completion"
      ? await seedCompletionTemplate(supabase, stored)
      : await topUpTemplate(supabase, stored);
  if (generateError) {
    return NextResponse.json(
      { error: `Template created, but generating the first occurrences failed: ${generateError}`, template },
      { status: 500 },
    );
  }

  const { error: trashError } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (trashError) {
    return NextResponse.json(
      { error: `Recurring task created but couldn't trash the original task: ${trashError.message}`, template },
      { status: 500 },
    );
  }

  return NextResponse.json(template, { status: 201 });
}
