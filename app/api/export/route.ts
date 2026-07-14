import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

export async function GET() {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    domains,
    projects,
    tasks,
    habits,
    habitLogs,
    dailyCheckins,
    routines,
    routineItems,
    checklists,
    checklistItems,
    knowledgeItems,
  ] = await Promise.all([
    supabase.from("domains").select("*"),
    supabase.from("projects").select("*"),
    supabase.from("tasks").select("*"),
    supabase.from("habits").select("*"),
    supabase.from("habit_logs").select("*"),
    supabase.from("daily_checkins").select("*"),
    supabase.from("routines").select("*"),
    supabase.from("routine_items").select("*"),
    supabase.from("checklists").select("*"),
    supabase.from("checklist_items").select("*"),
    supabase.from("knowledge_items").select("*"),
  ]);

  const data = {
    exported_at: new Date().toISOString(),
    domains: domains.data,
    projects: projects.data,
    tasks: tasks.data,
    habits: habits.data,
    habit_logs: habitLogs.data,
    daily_checkins: dailyCheckins.data,
    routines: routines.data,
    routine_items: routineItems.data,
    checklists: checklists.data,
    checklist_items: checklistItems.data,
    knowledge_items: knowledgeItems.data,
  };

  const filename = `life-os-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
