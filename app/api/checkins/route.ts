import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

export async function GET(request: Request) {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("daily_checkins")
    .select("*")
    .eq("date", date)
    .maybeSingle();

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
  const date =
    typeof body.date === "string" ? body.date : new Date().toISOString().slice(0, 10);
  const energyLevel = Number(body.energy_level);
  const focusLevel = Number(body.focus_level);

  if (!Number.isInteger(energyLevel) || energyLevel < 1 || energyLevel > 5) {
    return NextResponse.json({ error: "Energy level must be 1-5" }, { status: 400 });
  }
  if (!Number.isInteger(focusLevel) || focusLevel < 1 || focusLevel > 5) {
    return NextResponse.json({ error: "Focus level must be 1-5" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("daily_checkins")
    .upsert(
      {
        user_id: user.id,
        date,
        energy_level: energyLevel,
        focus_level: focusLevel,
        notes: typeof body.notes === "string" ? body.notes : undefined,
      },
      { onConflict: "user_id,date" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
