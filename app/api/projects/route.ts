import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

export async function GET() {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .is("deleted_at", null)
    .order("name");

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
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name,
      description:
        typeof body.description === "string" ? body.description : undefined,
      purpose: typeof body.purpose === "string" ? body.purpose : undefined,
      outcome_vision: typeof body.outcome_vision === "string" ? body.outcome_vision : undefined,
      brainstorm: typeof body.brainstorm === "string" ? body.brainstorm : undefined,
      domain_id: typeof body.domain_id === "string" ? body.domain_id : null,
      parent_project_id:
        typeof body.parent_project_id === "string" ? body.parent_project_id : null,
      status: typeof body.status === "string" ? body.status : undefined,
      priority: typeof body.priority === "string" ? body.priority : undefined,
      due_date: typeof body.due_date === "string" ? body.due_date : undefined,
      scheduled_date:
        typeof body.scheduled_date === "string" ? body.scheduled_date : undefined,
      link: typeof body.link === "string" && body.link.trim() ? body.link.trim() : undefined,
      review_every_days:
        Number.isInteger(body.review_every_days) && body.review_every_days > 0
          ? body.review_every_days
          : undefined,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
