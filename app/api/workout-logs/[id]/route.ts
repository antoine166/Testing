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
  const updates: Record<string, unknown> = {};

  if ("duration_minutes" in body) {
    const durationMinutes =
      typeof body.duration_minutes === "number" ? body.duration_minutes : null;
    if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 0)) {
      return NextResponse.json(
        { error: "duration_minutes must be a non-negative integer" },
        { status: 400 },
      );
    }
    updates.duration_minutes = durationMinutes;
  }
  if ("notes" in body) {
    updates.notes = typeof body.notes === "string" ? body.notes : null;
  }

  const { data, error } = await supabase
    .from("workout_logs")
    .update(updates)
    .eq("id", id)
    .select("id, workout_id, logged_date, duration_minutes, notes, created_at")
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

  const { error } = await supabase.from("workout_logs").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
