import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

export async function GET() {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("habits")
    .select("*")
    .is("deleted_at", null)
    // Manual order first (#142); nulls first so never-dragged habits stay
    // on top, then the old name order as the stable fallback.
    .order("sort_order", { ascending: true, nullsFirst: true })
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

  const targetCount =
    typeof body.target_count === "number" ? body.target_count : null;
  if (targetCount !== null && (!Number.isInteger(targetCount) || targetCount < 1)) {
    return NextResponse.json(
      { error: "target_count must be a positive integer" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("habits")
    .insert({
      user_id: user.id,
      name,
      color: typeof body.color === "string" ? body.color : undefined,
      icon: typeof body.icon === "string" ? body.icon : undefined,
      frequency: typeof body.frequency === "string" ? body.frequency : undefined,
      frequency_days: Array.isArray(body.frequency_days)
        ? body.frequency_days
        : null,
      target_count: targetCount,
      domain_id: typeof body.domain_id === "string" ? body.domain_id : null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
