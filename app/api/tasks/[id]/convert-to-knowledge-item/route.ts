import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { syncTaskCalendarEvent } from "@/lib/google-calendar/sync";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GTD's first Clarify fork: "is it actionable?" A "no" should leave the
 * action system in one motion, not linger as a task someone eventually
 * recreates by hand in the Knowledge Library. Mirrors convert-to-project:
 * creates a knowledge item from the task's title/notes/link, then trashes
 * the original task. Deliberately no type/folder picker — "this is
 * reference, not action" is meant to be one click, not a form; it can be
 * retyped/refiled afterward from the Library like anything else there.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { data: item, error: itemError } = await supabase
    .from("knowledge_items")
    .insert({
      user_id: user.id,
      title: task.title,
      content: task.notes,
      url: task.link,
      type: "note",
    })
    .select()
    .single();

  if (itemError) {
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  const { error: trashError } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (trashError) {
    return NextResponse.json(
      { error: `Knowledge item created but couldn't trash the original task: ${trashError.message}`, item },
      { status: 500 },
    );
  }

  // The task was just trashed — remove its pushed Google Calendar event, if
  // any (same post-trash reconcile convert-to-project does).
  await syncTaskCalendarEvent(user.id, id);

  return NextResponse.json(item, { status: 201 });
}
