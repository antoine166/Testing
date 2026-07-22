import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

// Global search across the whole external brain (SCOPE.md §3.13): tasks
// (including completed — search is how history gets found), projects,
// knowledge items, tickler notes, and agenda items. Case-insensitive
// substring matching; each bucket capped so one noisy word can't flood
// the response.
const PER_BUCKET = 20;

/** Escape ilike wildcards so a literal "%" or "_" in the query doesn't match everything. */
function escapeLike(q: string): string {
  return q.replace(/[%_]/g, (c) => `\\${c}`);
}

export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
  }
  const like = `%${escapeLike(q)}%`;

  const [tasks, projects, knowledgeItems, ticklerItems, agendaItems] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, notes, status, someday, waiting_for, domain_id, project_id, scheduled_date, due_date, completed_at")
      .is("deleted_at", null)
      .or(`title.ilike.${like},notes.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(PER_BUCKET),
    supabase
      .from("projects")
      .select("id, name, description, status, domain_id")
      .is("deleted_at", null)
      .or(`name.ilike.${like},description.ilike.${like},purpose.ilike.${like},outcome_vision.ilike.${like},brainstorm.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(PER_BUCKET),
    supabase
      .from("knowledge_items")
      .select("id, title, content, url, type, folder_id, project_id")
      .is("deleted_at", null)
      .or(`title.ilike.${like},content.ilike.${like}`)
      .order("updated_at", { ascending: false })
      .limit(PER_BUCKET),
    supabase
      .from("tickler_items")
      .select("id, note, revisit_date")
      .is("deleted_at", null)
      .ilike("note", like)
      .order("revisit_date")
      .limit(PER_BUCKET),
    supabase
      .from("agenda_items")
      .select("id, person_name, note, done")
      .or(`person_name.ilike.${like},note.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(PER_BUCKET),
  ]);

  const firstError =
    tasks.error ?? projects.error ?? knowledgeItems.error ?? ticklerItems.error ?? agendaItems.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  return NextResponse.json({
    query: q,
    tasks: tasks.data,
    projects: projects.data,
    knowledge_items: knowledgeItems.data,
    tickler_items: ticklerItems.data,
    agenda_items: agendaItems.data,
  });
}
