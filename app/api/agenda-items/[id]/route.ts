import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, string | boolean> = {};

  if (typeof body.person_name === "string") {
    const personName = body.person_name.trim();
    if (!personName) {
      return NextResponse.json({ error: "person_name cannot be empty" }, { status: 400 });
    }
    updates.person_name = personName;
  }
  if (typeof body.note === "string") {
    const note = body.note.trim();
    if (!note) {
      return NextResponse.json({ error: "note cannot be empty" }, { status: 400 });
    }
    updates.note = note;
  }
  if (typeof body.done === "boolean") {
    updates.done = body.done;
  }

  const { data, error } = await supabase
    .from("agenda_items")
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

  const { error } = await supabase.from("agenda_items").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
