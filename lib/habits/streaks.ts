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
