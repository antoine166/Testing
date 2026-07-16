import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("projects")
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
  const updates: Record<string, string | null> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    updates.name = name;
  }
  if (typeof body.description === "string") {
    updates.description = body.description;
  }
  if ("domain_id" in body) {
    updates.domain_id = typeof body.domain_id === "string" ? body.domain_id : null;
  }
  if ("parent_project_id" in body) {
    updates.parent_project_id =
      typeof body.parent_project_id === "string" ? body.parent_project_id : null;
  }
  if (typeof body.status === "string") {
    updates.status = body.status;
  }
  if (typeof body.priority === "string") {
    updates.priority = body.priority;
  }
  if ("due_date" in body) {
    updates.due_date = typeof body.due_date === "string" ? body.due_date : null;
  }
  if ("scheduled_date" in body) {
    updates.scheduled_date = typeof body.scheduled_date === "string" ? body.scheduled_date : null;
  }
  if ("link" in body) {
    updates.link = typeof body.link === "string" && body.link.trim() ? body.link.trim() : null;
  }

  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.rpc("trash_project", { p_project_id: id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
