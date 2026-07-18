import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * The tickler item's revisit_date arrived and it turns out to be
 * actionable now: creates a real task (lands in Inbox, same as any other
 * capture) from the note, then trashes the tickler item (recoverable for
 * 30 days like everything else).
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: ticklerItem, error: ticklerError } = await supabase
    .from("tickler_items")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (ticklerError || !ticklerItem) {
    return NextResponse.json({ error: "Tickler item not found" }, { status: 404 });
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({ user_id: user.id, title: ticklerItem.note })
    .select()
    .single();

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }

  const { error: trashError } = await supabase
    .from("tickler_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (trashError) {
    return NextResponse.json(
      { error: `Task created but couldn't trash the tickler item: ${trashError.message}`, task },
      { status: 500 },
    );
  }

  return NextResponse.json(task, { status: 201 });
}
