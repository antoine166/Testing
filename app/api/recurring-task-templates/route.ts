import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { seedCompletionTemplate, topUpTemplate, type StoredTemplate } from "@/lib/recurring-tasks/topup";
import { parseEnds, parseRecurrencePattern } from "@/lib/recurring-tasks/validate";

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

  const patternResult = parseRecurrencePattern(body);
  if ("error" in patternResult) {
    return NextResponse.json({ error: patternResult.error }, { status: 400 });
  }
  const endsResult = parseEnds(body);
  if ("error" in endsResult) {
    return NextResponse.json({ error: endsResult.error }, { status: 400 });
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
      ...patternResult.pattern,
      ...endsResult.ends,
      horizon_count: horizonCount,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  return NextResponse.json(template, { status: 201 });
}
