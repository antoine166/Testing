import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { ENERGY_LEVELS, PRIORITIES } from "@/lib/tasks/constants";
import { seedCompletionTemplate, topUpTemplate, type StoredTemplate } from "@/lib/recurring-tasks/topup";
import { todayLocal } from "@/lib/date";
import { parseEnds, parseRecurrencePattern } from "@/lib/recurring-tasks/validate";

type RouteParams = { params: Promise<{ id: string }> };


export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("recurring_task_templates")
    .select(
      "recurrence_type, days_of_week, day_of_month, interval_days, month_of_year, week_of_month, weekday_of_month, month_clamp, completion_offset_count, completion_offset_unit",
    )
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
  if ("context" in body) {
    updates.context = typeof body.context === "string" && body.context.trim() ? body.context.trim() : null;
  }
  if ("estimated_minutes" in body) {
    updates.estimated_minutes =
      typeof body.estimated_minutes === "number" && body.estimated_minutes > 0
        ? Math.round(body.estimated_minutes)
        : null;
  }
  if ("energy_level" in body) {
    updates.energy_level = ENERGY_LEVELS.includes(body.energy_level) ? body.energy_level : null;
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
    const patternResult = parseRecurrencePattern(body);
    if ("error" in patternResult) {
      return NextResponse.json({ error: patternResult.error }, { status: 400 });
    }
    Object.assign(updates, patternResult.pattern);

    // Otherwise the horizon-topup deficit check keeps counting the
    // old-pattern occurrences that are still generated-and-future against
    // the (unchanged) horizon, so no new-pattern occurrence would appear
    // until the entire old horizon drains naturally (up to `horizon_count`
    // cycles later) — silently doing nothing for a potentially long time.
    const sortedDays = (d: number[] | null) => JSON.stringify([...(d ?? [])].sort());
    patternChanged =
      patternResult.pattern.recurrence_type !== existing.recurrence_type ||
      sortedDays(patternResult.pattern.days_of_week) !== sortedDays(existing.days_of_week) ||
      (patternResult.pattern.day_of_month ?? null) !== (existing.day_of_month ?? null) ||
      (patternResult.pattern.interval_days ?? null) !== (existing.interval_days ?? null) ||
      (patternResult.pattern.month_of_year ?? null) !== (existing.month_of_year ?? null) ||
      (patternResult.pattern.week_of_month ?? null) !== (existing.week_of_month ?? null) ||
      (patternResult.pattern.weekday_of_month ?? null) !== (existing.weekday_of_month ?? null) ||
      patternResult.pattern.month_clamp !== (existing.month_clamp ?? "clamp") ||
      (patternResult.pattern.completion_offset_count ?? null) !== (existing.completion_offset_count ?? null) ||
      (patternResult.pattern.completion_offset_unit ?? null) !== (existing.completion_offset_unit ?? null);

    if (patternChanged) {
      updates.last_generated_date = null;
    }
  }

  if ("ends_type" in body || "ends_date" in body || "ends_count" in body) {
    const endsResult = parseEnds(body);
    if ("error" in endsResult) {
      return NextResponse.json({ error: endsResult.error }, { status: 400 });
    }
    Object.assign(updates, endsResult.ends);
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

    const stored = data as StoredTemplate;
    const { error: generateError } =
      stored.recurrence_type === "completion"
        ? await seedCompletionTemplate(supabase, stored)
        : await topUpTemplate(supabase, stored);
    if (generateError) {
      return NextResponse.json(
        { error: `Pattern updated, but generating new occurrences failed: ${generateError}`, template: data },
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
