import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { generateNextCompletionOccurrence } from "@/lib/recurring-tasks/topup";
import { todayLocal } from "@/lib/date";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, string | boolean | number | null> = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }
    updates.title = title;
  }
  if (typeof body.notes === "string") {
    updates.notes = body.notes;
  }
  if ("link" in body) {
    updates.link = typeof body.link === "string" && body.link.trim() ? body.link.trim() : null;
  }
  if ("context" in body) {
    updates.context =
      typeof body.context === "string" && body.context.trim() ? body.context.trim() : null;
  }
  if ("project_id" in body) {
    updates.project_id = typeof body.project_id === "string" ? body.project_id : null;
  }
  if ("domain_id" in body) {
    updates.domain_id = typeof body.domain_id === "string" ? body.domain_id : null;
  }
  if (typeof body.priority === "string") {
    updates.priority = body.priority;
  }
  if ("due_date" in body) {
    updates.due_date = typeof body.due_date === "string" ? body.due_date : null;
  }
  if ("scheduled_date" in body) {
    updates.scheduled_date =
      typeof body.scheduled_date === "string" ? body.scheduled_date : null;
  }
  if (typeof body.someday === "boolean") {
    updates.someday = body.someday;
  }
  if ("estimated_minutes" in body) {
    updates.estimated_minutes = typeof body.estimated_minutes === "number" ? body.estimated_minutes : null;
  }
  if ("energy_level" in body) {
    updates.energy_level = typeof body.energy_level === "string" ? body.energy_level : null;
  }
  if ("revisit_date" in body) {
    updates.revisit_date = typeof body.revisit_date === "string" ? body.revisit_date : null;
  }
  if ("follow_up_date" in body) {
    updates.follow_up_date = typeof body.follow_up_date === "string" ? body.follow_up_date : null;
  }
  if (typeof body.waiting_for === "boolean") {
    const { data: existing } = await supabase
      .from("tasks")
      .select("waiting_for")
      .eq("id", id)
      .maybeSingle();

    updates.waiting_for = body.waiting_for;
    if (!existing?.waiting_for && body.waiting_for) {
      updates.waiting_since = new Date().toISOString().slice(0, 10);
    } else if (!body.waiting_for) {
      // Wins over any follow_up_date in the same payload — a task that's
      // no longer Waiting For can't have a follow-up date, same as
      // revisit_date being someday-gated above.
      updates.waiting_since = null;
      updates.follow_up_date = null;
    }
  }
  let justCompleted = false;
  if (typeof body.status === "string") {
    const { data: existing } = await supabase
      .from("tasks")
      .select("status")
      .eq("id", id)
      .maybeSingle();

    updates.status = body.status;
    if (existing?.status !== body.status) {
      updates.completed_at = body.status === "done" ? new Date().toISOString() : null;
      justCompleted = body.status === "done";
    }
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // An after-completion recurring task doesn't pre-generate its next
  // occurrence ahead of time like every other recurrence type — it's
  // spawned here, offset from the date it was actually finished.
  if (justCompleted && data.recurring_template_id) {
    await generateNextCompletionOccurrence(supabase, data.recurring_template_id, todayLocal());
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope = new URL(request.url).searchParams.get("scope");

  if (scope === "following") {
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("recurring_template_id, scheduled_date")
      .eq("id", id)
      .single();

    if (taskError || !task?.recurring_template_id) {
      return NextResponse.json(
        { error: "Not part of a recurring series" },
        { status: 400 },
      );
    }

    const { error: deleteError } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("recurring_template_id", task.recurring_template_id)
      .is("deleted_at", null)
      .neq("status", "done")
      .gte("scheduled_date", task.scheduled_date ?? "0000-01-01");

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Otherwise the next top-up run just sees a deficit against the
    // template's horizon and regenerates replacements for what was just
    // deleted, silently undoing this. Also reset last_generated_date: it
    // was left pointing at the (now-deleted) last occurrence, so without
    // this, resuming later would resume generation *after* that stale
    // future date instead of from today — a silent gap of up to
    // horizon_count cycles before anything reappears.
    await supabase
      .from("recurring_task_templates")
      .update({ active: false, last_generated_date: null })
      .eq("id", task.recurring_template_id);

    return new NextResponse(null, { status: 204 });
  }

  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
