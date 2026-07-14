import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { constantTimeEqual } from "@/lib/mcp/oauth";
import { todayLocal } from "@/lib/date";
import { isAtRisk, isHabitDueToday } from "@/lib/habits/streaks";

// Plain token-secured endpoint for the scheduled daily-digest routine to
// call directly (via curl/Bash), independent of any specific Claude
// session. Deliberately NOT part of the MCP connector: the connector
// requires per-chat enablement, which a routine's freshly spawned session
// never has by default — this sidesteps that entirely.
export async function GET(request: Request) {
  const expected = process.env.DIGEST_ACCESS_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Digest endpoint isn't configured" }, { status: 503 });
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

  const [checkinRes, habitsRes, tasksRes] = await Promise.all([
    admin.from("daily_checkins").select("*").eq("user_id", owner.id).eq("date", today).maybeSingle(),
    admin.from("habits").select("*").eq("user_id", owner.id).is("deleted_at", null).eq("active", true),
    admin.from("tasks").select("*").eq("user_id", owner.id).is("deleted_at", null).neq("status", "done"),
  ]);
  if (checkinRes.error) return NextResponse.json({ error: checkinRes.error.message }, { status: 500 });
  if (habitsRes.error) return NextResponse.json({ error: habitsRes.error.message }, { status: 500 });
  if (tasksRes.error) return NextResponse.json({ error: tasksRes.error.message }, { status: 500 });

  const habits = habitsRes.data;
  const { data: logs, error: logsError } = await admin
    .from("habit_logs")
    .select("habit_id, logged_date")
    .in(
      "habit_id",
      habits.map((h) => h.id),
    );
  if (logsError) return NextResponse.json({ error: logsError.message }, { status: 500 });

  const dueHabits = habits
    .filter((h) => isHabitDueToday(h, today))
    .map((h) => {
      const habitLogs = logs.filter((l) => l.habit_id === h.id);
      return {
        name: h.name,
        logged_today: habitLogs.some((l) => l.logged_date === today),
        at_risk: isAtRisk(h, habitLogs, today),
      };
    });

  const tasks = tasksRes.data;
  const scheduledToday = tasks.filter((t) => t.scheduled_date === today);
  const overdue = tasks.filter((t) => t.scheduled_date && t.scheduled_date < today);

  return NextResponse.json({
    date: today,
    checkin: checkinRes.data,
    habits_due_today: dueHabits,
    tasks_scheduled_today: scheduledToday.map((t) => ({ title: t.title, priority: t.priority })),
    overdue_tasks: overdue.map((t) => ({ title: t.title, scheduled_date: t.scheduled_date })),
  });
}
