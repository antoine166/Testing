import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { clientDateOr } from "@/lib/date";
import { syncTaskCalendarEvent } from "@/lib/google-calendar/sync";

export async function GET(request: Request) {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Opt-in filters — with none set, the response is identical to before.
  // `done` is boolean-shaped ("true"/"false") rather than a raw status
  // value because statuses are todo/in_progress/done and every consumer
  // splits on done-vs-not-done; a status=todo filter would silently drop
  // in_progress tasks.
  const params = new URL(request.url).searchParams;

  let query = supabase
    .from("tasks")
    .select(
      "*, recurring_task_templates(recurrence_type, days_of_week, day_of_month, interval_days), task_attachments(count)",
    )
    .is("deleted_at", null);

  const done = params.get("done");
  if (done === "true") query = query.eq("status", "done");
  else if (done === "false") query = query.neq("status", "done");

  const domainId = params.get("domain_id");
  if (domainId) query = query.eq("domain_id", domainId);

  const projectId = params.get("project_id");
  if (projectId) query = query.eq("project_id", projectId);

  const limit = Number(params.get("limit"));
  if (Number.isInteger(limit) && limit > 0) query = query.limit(limit);

  const { data, error } = await query
    // Manual order first (hand-arranged positions); nulls first so untouched
    // tasks and fresh captures surface at the top, newest first, exactly as
    // before manual ordering existed.
    .order("sort_order", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten the count so rows can decide whether to fetch attachments at
  // all (TaskRow skips the per-task attachments request when it's 0).
  const withCounts = data.map(({ task_attachments, ...task }) => ({
    ...task,
    attachment_count: task_attachments?.[0]?.count ?? 0,
  }));

  // Per-page ordering (#142): with a list_key, each task also carries its
  // saved position in that list (null = never hand-placed there). A second
  // query merged in code rather than a join — list_orders is keyed by
  // item_id, not a real FK the embedded-select syntax could follow.
  const listKey = params.get("list_key");
  if (listKey) {
    const { data: orders, error: ordersError } = await supabase
      .from("list_orders")
      .select("item_id, position")
      .eq("list_key", listKey)
      .eq("item_type", "task");
    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }
    const positions = new Map(orders.map((o) => [o.item_id, o.position]));
    return NextResponse.json(
      withCounts.map((task) => ({ ...task, position: positions.get(task.id) ?? null })),
    );
  }

  return NextResponse.json(withCounts);
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
      person_id: typeof body.person_id === "string" ? body.person_id : null,
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
      // The client's local date, not the server's UTC one — at 10pm
      // Eastern the server already thinks it's tomorrow (#112 item 4).
      waiting_since:
        body.waiting_for === true
          ? clientDateOr(body.client_date, new Date().toISOString().slice(0, 10))
          : undefined,
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
