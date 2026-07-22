import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

// Everything, meaning everything: if a table holds user content, it belongs
// here. (This list drifted badly once — features shipped for weeks without
// being added — so keep it in the same change as any new table, like the
// MCP parity rule.) Excluded on purpose: OAuth token tables
// (gmail_connections, google_calendar_connections, mcp_oauth_*) — secrets
// don't belong in a download — and task_attachments' actual files (the rows
// carry storage paths, not bytes; Supabase Storage is the file backup).
const EXPORT_TABLES = [
  "domains",
  "projects",
  "project_templates",
  "project_template_tasks",
  "tasks",
  "task_attachments",
  "recurring_task_templates",
  "habits",
  "habit_logs",
  "daily_checkins",
  "routines",
  "routine_items",
  "checklists",
  "checklist_items",
  "knowledge_folders",
  "knowledge_items",
  "tickler_items",
  "agenda_items",
  "contexts",
  "people",
  "workouts",
  "workout_logs",
  "workout_log_attachments",
  "horizons",
] as const;

export async function GET() {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await Promise.all(
    EXPORT_TABLES.map((table) => supabase.from(table).select("*")),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  const data: Record<string, unknown> = { exported_at: new Date().toISOString() };
  EXPORT_TABLES.forEach((table, i) => {
    data[table] = results[i].data;
  });

  const filename = `life-os-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
