import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

export async function GET() {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("horizons")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? { goals: "", vision: "", purpose: "" });
}

export async function PUT(request: Request) {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Merge onto the existing row so a partial update doesn't blank the other
  // fields — same semantics as the MCP connector's update_horizons. (The app
  // form always sends all three, but the API shouldn't rely on that.)
  const { data: existing, error: readError } = await supabase
    .from("horizons")
    .select("goals, vision, purpose")
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("horizons")
    .upsert({
      user_id: user.id,
      goals: typeof body.goals === "string" ? body.goals : (existing?.goals ?? ""),
      vision: typeof body.vision === "string" ? body.vision : (existing?.vision ?? ""),
      purpose: typeof body.purpose === "string" ? body.purpose : (existing?.purpose ?? ""),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
