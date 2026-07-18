import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

export async function GET() {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("tickler_items")
    .select("*")
    .is("deleted_at", null)
    .order("revisit_date");

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
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const revisitDate = typeof body.revisit_date === "string" ? body.revisit_date : "";

  if (!note) {
    return NextResponse.json({ error: "Note is required" }, { status: 400 });
  }
  if (!revisitDate) {
    return NextResponse.json({ error: "Revisit date is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tickler_items")
    .insert({ user_id: user.id, note, revisit_date: revisitDate })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
