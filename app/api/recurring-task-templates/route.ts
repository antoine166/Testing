import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { topUpTemplate, type StoredTemplate } from "@/lib/recurring-tasks/topup";

const RECURRENCE_TYPES = ["weekly", "monthly", "interval"] as const;
const PRIORITIES = ["none", "low", "medium", "high"] as const;

export async function GET() {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("recurring_task_templates")
    .select("*")
    .order("created_at");

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

  const recurrenceType = body.recurrence_type;
  if (!RECURRENCE_TYPES.includes(recurrenceType)) {
    return NextResponse.json({ error: "Invalid recurrence_type" }, { status: 400 });
  }

  let daysOfWeek: number[] | null = null;
  let dayOfMonth: number | null = null;
  let intervalDays: number | null = null;

  if (recurrenceType === "weekly") {
    const parsed: number[] = Array.isArray(body.days_of_week) ? body.days_of_week.map(Number) : [];
    if (parsed.length === 0 || parsed.some((d) => d < 0 || d > 6)) {
      return NextResponse.json({ error: "days_of_week must be one or more of 0-6" }, { status: 400 });
    }
    daysOfWeek = parsed;
  } else if (recurrenceType === "monthly") {
    dayOfMonth = Number(body.day_of_month);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return NextResponse.json({ error: "day_of_month must be 1-31" }, { status: 400 });
    }
  } else {
    intervalDays = Number(body.interval_days);
    if (!Number.isInteger(intervalDays) || intervalDays < 1) {
      return NextResponse.json({ error: "interval_days must be a positive integer" }, { status: 400 });
    }
  }

  const horizonCount = body.horizon_count !== undefined ? Number(body.horizon_count) : 12;
  if (!Number.isInteger(horizonCount) || horizonCount < 1 || horizonCount > 52) {
    return NextResponse.json({ error: "horizon_count must be between 1 and 52" }, { status: 400 });
  }

  const priority = PRIORITIES.includes(body.priority) ? body.priority : "none";

  const { data: template, error } = await supabase
    .from("recurring_task_templates")
    .insert({
      user_id: user.id,
      title,
      notes: typeof body.notes === "string" && body.notes ? body.notes : null,
      link: typeof body.link === "string" && body.link.trim() ? body.link.trim() : null,
      domain_id: typeof body.domain_id === "string" ? body.domain_id : null,
      project_id: typeof body.project_id === "string" ? body.project_id : null,
      priority,
      recurrence_type: recurrenceType,
      days_of_week: daysOfWeek,
      day_of_month: dayOfMonth,
      interval_days: intervalDays,
      horizon_count: horizonCount,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: topUpError } = await topUpTemplate(supabase, template as StoredTemplate);
  if (topUpError) {
    return NextResponse.json(
      { error: `Template created, but generating the first occurrences failed: ${topUpError}`, template },
      { status: 500 },
    );
  }

  return NextResponse.json(template, { status: 201 });
}
