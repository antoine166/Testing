import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { topUpTemplate, type StoredTemplate } from "@/lib/recurring-tasks/topup";
import { todayLocal } from "@/lib/date";

type RouteParams = { params: Promise<{ id: string }> };

const RECURRENCE_TYPES = ["weekly", "monthly", "interval"] as const;
const PRIORITIES = ["none", "low", "medium", "high"] as const;

export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("recurring_task_templates")
    .select("recurrence_type, days_of_week, day_of_month, interval_days")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: existingError?.message ?? "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  let patternChanged = false;

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }
    updates.title = title;
  }
  if ("notes" in body) {
    updates.notes = typeof body.notes === "string" && body.notes ? body.notes : null;
  }
  if ("link" in body) {
    updates.link = typeof body.link === "string" && body.link.trim() ? body.link.trim() : null;
  }
  if ("domain_id" in body) {
    updates.domain_id = typeof body.domain_id === "string" ? body.domain_id : null;
  }
  if ("project_id" in body) {
    updates.project_id = typeof body.project_id === "string" ? body.project_id : null;
  }
  if (typeof body.priority === "string" && PRIORITIES.includes(body.priority)) {
    updates.priority = body.priority;
  }
  if (typeof body.active === "boolean") {
    updates.active = body.active;
  }
  if (typeof body.horizon_count === "number") {
    if (!Number.isInteger(body.horizon_count) || body.horizon_count < 1 || body.horizon_count > 52) {
      return NextResponse.json({ error: "horizon_count must be between 1 and 52" }, { status: 400 });
    }
    updates.horizon_count = body.horizon_count;
  }

  if (typeof body.recurrence_type === "string") {
    if (!RECURRENCE_TYPES.includes(body.recurrence_type as (typeof RECURRENCE_TYPES)[number])) {
      return NextResponse.json({ error: "Invalid recurrence_type" }, { status: 400 });
    }
    updates.recurrence_type = body.recurrence_type;
    // Changing the pattern type replaces all three pattern fields together
    // (the DB check constraint requires exactly one to be set) — the
    // caller must pass the fields for the new type.
    updates.days_of_week = null;
    updates.day_of_month = null;
    updates.interval_days = null;

    if (body.recurrence_type === "weekly") {
      const daysOfWeek = Array.isArray(body.days_of_week) ? body.days_of_week.map(Number) : [];
      if (daysOfWeek.length === 0 || daysOfWeek.some((d: number) => d < 0 || d > 6)) {
        return NextResponse.json({ error: "days_of_week must be one or more of 0-6" }, { status: 400 });
      }
      updates.days_of_week = daysOfWeek;
    } else if (body.recurrence_type === "monthly") {
      const dayOfMonth = Number(body.day_of_month);
      if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
        return NextResponse.json({ error: "day_of_month must be 1-31" }, { status: 400 });
      }
      updates.day_of_month = dayOfMonth;
    } else {
      const intervalDays = Number(body.interval_days);
      if (!Number.isInteger(intervalDays) || intervalDays < 1) {
        return NextResponse.json({ error: "interval_days must be a positive integer" }, { status: 400 });
      }
      updates.interval_days = intervalDays;
    }

    // Otherwise the horizon-topup deficit check keeps counting the
    // old-pattern occurrences that are still generated-and-future against
    // the (unchanged) horizon, so no new-pattern occurrence would appear
    // until the entire old horizon drains naturally (up to `horizon_count`
    // cycles later) — silently doing nothing for a potentially long time.
    const sortedDays = (d: number[] | null) => JSON.stringify([...(d ?? [])].sort());
    patternChanged =
      updates.recurrence_type !== existing.recurrence_type ||
      sortedDays(updates.days_of_week as number[] | null) !== sortedDays(existing.days_of_week) ||
      (updates.day_of_month ?? null) !== (existing.day_of_month ?? null) ||
      (updates.interval_days ?? null) !== (existing.interval_days ?? null);

    if (patternChanged) {
      updates.last_generated_date = null;
    }
  }

  const { data, error } = await supabase
    .from("recurring_task_templates")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (patternChanged) {
    // Detach (not delete) rather than trash: matches what already happens
    // today when a whole template is deleted instead — "already-generated
    // occurrences stay as regular tasks." These were generated under the
    // old pattern, so they no longer belong to this series, but they're
    // still real tasks the user may already be relying on.
    const { error: detachError } = await supabase
      .from("tasks")
      .update({ recurring_template_id: null })
      .eq("recurring_template_id", id)
      .is("deleted_at", null)
      .neq("status", "done")
      .gte("scheduled_date", todayLocal());

    if (detachError) {
      return NextResponse.json(
        { error: `Pattern updated, but detaching old occurrences failed: ${detachError.message}`, template: data },
        { status: 500 },
      );
    }

    const { error: topUpError } = await topUpTemplate(supabase, data as StoredTemplate);
    if (topUpError) {
      return NextResponse.json(
        { error: `Pattern updated, but generating new occurrences failed: ${topUpError}`, template: data },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.from("recurring_task_templates").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
