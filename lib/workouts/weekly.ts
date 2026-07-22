// Weekly goal tracking for workouts (e.g. "GPP Lift, 1x/week") — mirrors
// lib/habits/streaks.ts's times_per_week math (Monday-Sunday calendar
// weeks, current week excluded from the backward streak walk until it
// closes), kept as a standalone copy rather than shared since workouts
// have no other frequency modes to unify with.

export type WorkoutLogForWeekly = { logged_date: string };

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function weekKey(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  const mondayOffset = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - mondayOffset);
  return formatLocalDate(d);
}

/** How many times this workout's been logged in the current Monday-Sunday week. */
export function countThisWeek(logs: WorkoutLogForWeekly[], today: string): number {
  const currentWeekKey = weekKey(today);
  return logs.filter((l) => weekKey(l.logged_date) === currentWeekKey).length;
}

/**
 * Current/longest streak of consecutive weeks where the log count met
 * `target`. The in-progress current week counts once it's already hit
 * target (credited before walking backward); it doesn't break the streak
 * just for not being over yet.
 */
export function computeWeeklyGoalStreak(
  logs: WorkoutLogForWeekly[],
  today: string,
  target: number,
): { current: number; longest: number } {
  const currentWeekKey = weekKey(today);
  const countsByWeek = new Map<string, number>();
  for (const log of logs) {
    const key = weekKey(log.logged_date);
    countsByWeek.set(key, (countsByWeek.get(key) ?? 0) + 1);
  }

  let current = (countsByWeek.get(currentWeekKey) ?? 0) >= target ? 1 : 0;
  let cursor = addDays(parseLocalDate(currentWeekKey), -7);
  for (let i = 0; i < 520; i++) {
    const key = weekKey(formatLocalDate(cursor));
    const count = countsByWeek.get(key) ?? 0;
    if (count >= target) {
      current++;
      cursor = addDays(cursor, -7);
    } else {
      break;
    }
  }

  const weekKeys = [...countsByWeek.keys()].sort();
  let longest = 0;
  let run = 0;
  let prevWeek: Date | null = null;

  for (const key of weekKeys) {
    if (key === currentWeekKey) continue; // handled via `current` above instead
    const count = countsByWeek.get(key)!;
    const weekDate = parseLocalDate(key);

    if (count >= target) {
      run = prevWeek && formatLocalDate(addDays(prevWeek, 7)) === key ? run + 1 : 1;
      longest = Math.max(longest, run);
      prevWeek = weekDate;
    } else {
      run = 0;
      prevWeek = null;
    }
  }
  longest = Math.max(longest, current);

  return { current, longest };
}

/**
 * "Don't break it twice" (James Clear) for weekly goals, mirroring
 * lib/habits/streaks.ts's isAtRisk for times_per_week habits: true only
 * once there are no more spare days left in the week to still hit
 * `target`, so it doesn't false-alarm early in the week (e.g. 4x/week with
 * 0 done: safe through Wednesday, at risk starting Thursday). Never true
 * once today is already logged.
 */
export function isAtRisk(logs: WorkoutLogForWeekly[], today: string, target: number): boolean {
  if (logs.some((l) => l.logged_date === today)) return false;

  const remainingNeeded = target - countThisWeek(logs, today);
  if (remainingNeeded <= 0) return false;

  const weekdayIndex = (parseLocalDate(today).getDay() + 6) % 7; // 0=Mon...6=Sun
  const daysLeftInWeek = 7 - weekdayIndex; // includes today
  return daysLeftInWeek <= remainingNeeded;
}
