import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { syncTaskCalendarEvent } from "@/lib/google-calendar/sync";

export async function GET() {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("*, recurring_task_templates(recurrence_type, days_of_week, day_of_month, interval_days)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      link: typeof body.link === "string" && body.link.trim() ? body.link.trim() : undefined,
      context:
        typeof body.context === "string" && body.context.trim() ? body.context.trim() : undefined,
      project_id: typeof body.project_id === "string" ? body.project_id : null,
      domain_id: typeof body.domain_id === "string" ? body.domain_id : null,
      status: typeof body.status === "string" ? body.status : undefined,
      priority: typeof body.priority === "string" ? body.priority : undefined,
      due_date: typeof body.due_date === "string" ? body.due_date : undefined,
      scheduled_date:
        typeof body.scheduled_date === "string" ? body.scheduled_date : undefined,
      // Only meaningful alongside scheduled_date — a real appointment
      // (hard landscape), not just a day you plan to work on it.
      scheduled_time:
        typeof body.scheduled_time === "string" && body.scheduled_time ? body.scheduled_time : undefined,
      someday: typeof body.someday === "boolean" ? body.someday : undefined,
      waiting_for: typeof body.waiting_for === "boolean" ? body.waiting_for : undefined,
      waiting_since: body.waiting_for === true ? new Date().toISOString().slice(0, 10) : undefined,
      waiting_on:
        body.waiting_for === true && typeof body.waiting_on === "string" && body.waiting_on.trim()
          ? body.waiting_on.trim()
          : undefined,
      estimated_minutes: typeof body.estimated_minutes === "number" ? body.estimated_minutes : undefined,
      energy_level: typeof body.energy_level === "string" ? body.energy_level : undefined,
      revisit_date: body.someday === true && typeof body.revisit_date === "string" ? body.revisit_date : undefined,
      follow_up_date:
        body.waiting_for === true && typeof body.follow_up_date === "string"
          ? body.follow_up_date
          : undefined,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Only time-blocked tasks ever get a Google Calendar event, so plain
  // creates skip the sync round-trip entirely.
  if (data.scheduled_date && data.scheduled_time) {
    await syncTaskCalendarEvent(user.id, data.id);
  }

  return NextResponse.json(data, { status: 201 });
}
