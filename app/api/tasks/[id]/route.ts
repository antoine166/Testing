import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { generateNextCompletionOccurrence } from "@/lib/recurring-tasks/topup";
import { clientDateOr, todayLocal } from "@/lib/date";
import { syncTaskCalendarEvent, syncTaskCalendarEvents } from "@/lib/google-calendar/sync";

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
  if ("person_id" in body) {
    updates.person_id = typeof body.person_id === "string" ? body.person_id : null;
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
  if ("scheduled_time" in body) {
    updates.scheduled_time =
      typeof body.scheduled_time === "string" && body.scheduled_time ? body.scheduled_time : null;
  }
  if (typeof body.someday === "boolean") {
    updates.someday = body.someday;
  }
  if ("sort_order" in body) {
    updates.sort_order = typeof body.sort_order === "number" ? body.sort_order : null;
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
  if ("waiting_on" in body) {
    updates.waiting_on =
      typeof body.waiting_on === "string" && body.waiting_on.trim() ? body.waiting_on.trim() : null;
  }
  if (typeof body.waiting_for === "boolean") {
    const { data: existing } = await supabase
      .from("tasks")
      .select("waiting_for")
      .eq("id", id)
      .maybeSingle();

    updates.waiting_for = body.waiting_for;
    if (!existing?.waiting_for && body.waiting_for) {
      // Client's local date over the server's UTC clock (#112 item 4).
      updates.waiting_since = clientDateOr(body.client_date, new Date().toISOString().slice(0, 10));
    } else if (!body.waiting_for) {
      // Wins over any follow_up_date/waiting_on in the same payload — a
      // task that's no longer Waiting For can't have a follow-up date or a
      // person it's waiting on, same as revisit_date being someday-gated
      // above.
      updates.waiting_since = null;
      updates.follow_up_date = null;
      updates.waiting_on = null;
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

  await syncTaskCalendarEvent(user.id, id);

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

    // Occurrences the user time-blocked by hand may have pushed Google
    // Calendar events — collect them before the bulk trash so they can be
    // reconciled after (the trash would otherwise orphan the events).
    const { data: calendarLinked } = await supabase
      .from("tasks")
      .select("id")
      .eq("recurring_template_id", task.recurring_template_id)
      .is("deleted_at", null)
      .neq("status", "done")
      .gte("scheduled_date", task.scheduled_date ?? "0000-01-01")
      .not("gcal_event_id", "is", null);

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

    // Delete the template itself, not just deactivate it — "This + future"
    // means the series is over, and a lingering (deactivated) template row
    // kept showing up in the Tasks page's Recurring list. Done occurrences
    // keep their history (FK is on delete set null), and any trashed
    // occurrences restore as plain tasks. Deleting also guarantees the
    // top-up run can never regenerate what was just removed.
    await supabase
      .from("recurring_task_templates")
      .delete()
      .eq("id", task.recurring_template_id);

    await syncTaskCalendarEvents(
      user.id,
      (calendarLinked ?? []).map((t) => t.id),
    );

    return new NextResponse(null, { status: 204 });
  }

  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await syncTaskCalendarEvent(user.id, id);

  return new NextResponse(null, { status: 204 });
}
