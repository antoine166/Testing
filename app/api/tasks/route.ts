import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

export async function GET() {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
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
      project_id: typeof body.project_id === "string" ? body.project_id : null,
      domain_id: typeof body.domain_id === "string" ? body.domain_id : null,
      status: typeof body.status === "string" ? body.status : undefined,
      priority: typeof body.priority === "string" ? body.priority : undefined,
      due_date: typeof body.due_date === "string" ? body.due_date : undefined,
      scheduled_date:
        typeof body.scheduled_date === "string" ? body.scheduled_date : undefined,
      someday: typeof body.someday === "boolean" ? body.someday : undefined,
      waiting_on:
        typeof body.waiting_on === "string" && body.waiting_on.trim()
          ? body.waiting_on.trim()
          : undefined,
      waiting_since:
        typeof body.waiting_on === "string" && body.waiting_on.trim()
          ? new Date().toISOString().slice(0, 10)
          : undefined,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
