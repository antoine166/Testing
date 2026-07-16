export type HabitFrequency = "daily" | "specific_days" | "times_per_week";

export type Habit = {
  frequency: HabitFrequency;
  frequency_days: number[] | null;
  target_count: number | null;
};

export type HabitLog = {
  logged_date: string; // YYYY-MM-DD
};

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

function isRequiredDay(habit: Habit, date: Date): boolean {
  if (habit.frequency === "daily") return true;
  if (habit.frequency === "specific_days") {
    return (habit.frequency_days ?? []).includes(date.getDay());
  }
  return false;
}

// times_per_week habits don't have a fixed required day — any day can
// count toward the week's target, so they're always "due" (available
// to check off) rather than tied to a specific weekday.
export function isHabitDueToday(habit: Habit, today: string): boolean {
  if (habit.frequency === "times_per_week") return true;
  return isRequiredDay(habit, parseLocalDate(today));
}

function computeDailyStreak(
  habit: Habit,
  loggedDates: Set<string>,
  today: string,
): { current: number; longest: number } {
  let current = 0;
  let cursor = parseLocalDate(today);

  // If today is required and not logged yet, give grace until the day
  // ends instead of immediately breaking the streak.
  if (isRequiredDay(habit, cursor) && !loggedDates.has(formatLocalDate(cursor))) {
    cursor = addDays(cursor, -1);
  }

  for (let i = 0; i < 3650; i++) {
    if (isRequiredDay(habit, cursor)) {
      if (loggedDates.has(formatLocalDate(cursor))) {
        current++;
        cursor = addDays(cursor, -1);
      } else {
        break;
      }
    } else {
      cursor = addDays(cursor, -1);
    }
  }

  const sortedDates = [...loggedDates].sort();
  let longest = 0;
  let run = 0;
  let prevDate: Date | null = null;

  for (const dateStr of sortedDates) {
    const date = parseLocalDate(dateStr);
    if (!isRequiredDay(habit, date)) continue;

    if (prevDate) {
      let expected = addDays(prevDate, 1);
      let consecutive = true;
      while (expected < date) {
        if (isRequiredDay(habit, expected)) {
          consecutive = false;
          break;
        }
        expected = addDays(expected, 1);
      }
      run = consecutive ? run + 1 : 1;
    } else {
      run = 1;
    }

    longest = Math.max(longest, run);
    prevDate = date;
  }

  return { current, longest };
}

function getWeekKey(date: Date): string {
  const d = new Date(date);
  const mondayOffset = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - mondayOffset);
  return formatLocalDate(d);
}

function computeWeeklyStreak(
  habit: Habit,
  logs: HabitLog[],
  today: string,
): { current: number; longest: number } {
  const target = habit.target_count ?? 1;
  const currentWeekKey = getWeekKey(parseLocalDate(today));

  const countsByWeek = new Map<string, number>();
  for (const log of logs) {
    const week = getWeekKey(parseLocalDate(log.logged_date));
    countsByWeek.set(week, (countsByWeek.get(week) ?? 0) + 1);
  }

  // If the in-progress current week has already hit target, credit it (like
  // computeDailyStreak crediting today once it's logged) before walking
  // backward through fully-elapsed weeks.
  let current = (countsByWeek.get(currentWeekKey) ?? 0) >= target ? 1 : 0;
  let cursor = addDays(parseLocalDate(currentWeekKey), -7);
  for (let i = 0; i < 520; i++) {
    const key = getWeekKey(cursor);
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

/** How many times a times_per_week habit has been logged in the current week so far. */
export function countThisWeek(logs: HabitLog[], today: string): number {
  const currentWeekKey = getWeekKey(parseLocalDate(today));
  return logs.filter((l) => getWeekKey(parseLocalDate(l.logged_date)) === currentWeekKey).length;
}

export function computeStreak(
  habit: Habit,
  logs: HabitLog[],
  today: string,
): { current: number; longest: number } {
  if (habit.frequency === "times_per_week") {
    return computeWeeklyStreak(habit, logs, today);
  }
  const loggedDates = new Set(logs.map((l) => l.logged_date));
  return computeDailyStreak(habit, loggedDates, today);
}

/**
 * True when a habit still needs attention today: not yet checked off today,
 * AND (for times_per_week habits) the week's target hasn't been hit yet.
 * Both conditions matter for times_per_week — logging it today clears
 * today's action item even if the week isn't done, and hitting the week's
 * target clears it for the rest of the week even on a day it wasn't logged.
 */
export function isPendingToday(habit: Habit, logs: HabitLog[], today: string): boolean {
  if (!isHabitDueToday(habit, today)) return false;
  if (logs.some((l) => l.logged_date === today)) return false;
  if (habit.frequency === "times_per_week") {
    return countThisWeek(logs, today) < (habit.target_count ?? 1);
  }
  return true;
}

/**
 * "Don't break it twice" (James Clear): true when missing today would be a
 * second consecutive miss for daily/specific_days habits, or when a
 * times_per_week habit is genuinely running out of days to still hit its
 * weekly target — not just "under target so far," which fires as early as
 * Monday and isn't useful. Never true once today is already logged.
 */
export function isAtRisk(habit: Habit, logs: HabitLog[], today: string): boolean {
  if (logs.some((l) => l.logged_date === today)) return false;

  if (habit.frequency === "times_per_week") {
    const target = habit.target_count ?? 1;
    const todayDate = parseLocalDate(today);
    const currentWeekKey = getWeekKey(todayDate);
    const thisWeekCount = logs.filter(
      (l) => getWeekKey(parseLocalDate(l.logged_date)) === currentWeekKey,
    ).length;

    const remainingNeeded = target - thisWeekCount;
    if (remainingNeeded <= 0) return false;

    // Monday-indexed weekday (0=Mon...6=Sun), same convention as getWeekKey.
    const weekdayIndex = (todayDate.getDay() + 6) % 7;
    const daysLeftInWeek = 7 - weekdayIndex; // includes today
    // At risk once every remaining day (including today) is needed to still
    // hit target — e.g. 4x/week with 0 done: safe through Wednesday (5 days
    // left, only 4 needed), at risk starting Thursday (4 left, 4 needed).
    return daysLeftInWeek <= remainingNeeded;
  }

  const loggedDates = new Set(logs.map((l) => l.logged_date));
  let cursor = addDays(parseLocalDate(today), -1);
  for (let i = 0; i < 3650; i++) {
    if (isRequiredDay(habit, cursor)) {
      return !loggedDates.has(formatLocalDate(cursor));
    }
    cursor = addDays(cursor, -1);
  }
  return false;
}
