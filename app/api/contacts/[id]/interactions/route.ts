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
    .from("contact_interactions")
    .select("*")
    .eq("contact_id", id)
    .order("interacted_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const type = typeof body.type === "string" ? body.type : "";

  if (!type) {
    return NextResponse.json({ error: "Type is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("contact_interactions")
    .insert({
      user_id: user.id,
      contact_id: id,
      type,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      interacted_at:
        typeof body.interacted_at === "string" ? body.interacted_at : undefined,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
