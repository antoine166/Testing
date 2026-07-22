import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { constantTimeEqual } from "@/lib/mcp/oauth";
import { todayLocal, daysSince } from "@/lib/date";

// Week-in-review data for the Sunday retrospective routine (the routine
// runs in a fresh session with no MCP connector, so like /api/digest it
// reads through a token-secured endpoint instead). Guarded by the same
// DIGEST_ACCESS_TOKEN — same consumer class, same trust level, one less
// env var to manage.
export async function GET(request: Request) {
  const expected = process.env.DIGEST_ACCESS_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Retrospective endpoint isn't configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token || !constantTimeEqual(token, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: users, error: usersError } = await admin.auth.admin.listUsers();
  const owner = users?.users[0];
  if (usersError || !owner) {
    return NextResponse.json({ error: "No account to summarize" }, { status: 500 });
  }

  const today = todayLocal();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  const [doneRes, openRes, domainsRes, projectsRes, habitsRes, logsRes, workoutLogsRes] =
    await Promise.all([
      admin
        .from("tasks")
        .select("title, completed_at, domain_id, project_id")
        .eq("user_id", owner.id)
        .eq("status", "done")
        .gte("completed_at", weekAgoIso)
        .order("completed_at", { ascending: false }),
      admin
        .from("tasks")
        .select("title, scheduled_date, waiting_for, waiting_since")
        .eq("user_id", owner.id)
        .is("deleted_at", null)
        .neq("status", "done"),
      admin.from("domains").select("id, name").eq("user_id", owner.id),
      admin.from("projects").select("id, name").eq("user_id", owner.id).is("deleted_at", null),
      admin
        .from("habits")
        .select("id, name, frequency, target_count")
        .eq("user_id", owner.id)
        .is("deleted_at", null)
        .eq("active", true),
      admin
        .from("habit_logs")
        .select("habit_id, logged_date")
        .gte("logged_date", weekAgoIso.slice(0, 10)),
      admin
        .from("workout_logs")
        .select("workout_id, logged_date, workouts(name)")
        .eq("user_id", owner.id)
        .gte("logged_date", weekAgoIso.slice(0, 10)),
    ]);

  const firstError =
    doneRes.error ?? openRes.error ?? domainsRes.error ?? projectsRes.error ??
    habitsRes.error ?? logsRes.error ?? workoutLogsRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const domains = domainsRes.data ?? [];
  const projects = projectsRes.data ?? [];
  const done = doneRes.data ?? [];
  const habits = habitsRes.data ?? [];
  const logs = logsRes.data ?? [];
  const workoutLogs = workoutLogsRes.data ?? [];
  const open = openRes.data ?? [];

  const domainName = (id: string | null) => domains.find((d) => d.id === id)?.name ?? null;
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? null;

  return NextResponse.json({
    week_ending: today,
    completed_this_week: done.map((t) => ({
      title: t.title,
      completed_at: t.completed_at?.slice(0, 10),
      domain: domainName(t.domain_id),
      project: projectName(t.project_id),
    })),
    habits: habits.map((h) => ({
      name: h.name,
      frequency: h.frequency,
      target_count: h.target_count,
      logs_this_week: logs.filter((l) => l.habit_id === h.id).length,
    })),
    workouts_this_week: workoutLogs.map((w) => ({
      name: (w.workouts as unknown as { name: string } | null)?.name ?? "workout",
      date: w.logged_date,
    })),
    overdue_count: open.filter((t) => t.scheduled_date && t.scheduled_date < today).length,
    stale_waiting_for: open
      .filter((t) => t.waiting_for && t.waiting_since && daysSince(t.waiting_since) >= 7)
      .map((t) => ({ title: t.title, days_waiting: daysSince(t.waiting_since!) })),
  });
}
