import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

export async function GET() {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("habit_logs")
    .select("id, habit_id, logged_date")
    .order("logged_date");

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
  const habitId = typeof body.habit_id === "string" ? body.habit_id : "";
  const date = typeof body.date === "string" ? body.date : "";

  if (!habitId || !date) {
    return NextResponse.json(
      { error: "habit_id and date are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("habit_logs")
    .insert({ user_id: user.id, habit_id: habitId, logged_date: date })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const habitId = searchParams.get("habit_id");
  const date = searchParams.get("date");

  if (!habitId || !date) {
    return NextResponse.json(
      { error: "habit_id and date query params are required" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("habit_logs")
    .delete()
    .eq("habit_id", habitId)
    .eq("logged_date", date);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
