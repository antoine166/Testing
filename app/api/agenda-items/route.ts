import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

export async function GET() {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("agenda_items")
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
  const personName = typeof body.person_name === "string" ? body.person_name.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!personName || !note) {
    return NextResponse.json({ error: "person_name and note are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("agenda_items")
    .insert({ user_id: user.id, person_name: personName, note })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
