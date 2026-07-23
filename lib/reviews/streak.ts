// Weekly Review streak math — same Monday-Sunday calendar-week convention
// as habits (lib/habits/streaks.ts) and workouts (lib/workouts/weekly.ts),
// and the same in-progress-week grace: a week doesn't break the streak
// until it's over without a review, but joins the streak the moment one
// happens. Pure functions shared by the review page, the Today nudge,
// Analytics, and the MCP review snapshot.

/** Monday (YYYY-MM-DD, local) of the week containing `date` (YYYY-MM-DD). */
function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const mondayOffset = (dt.getDay() + 6) % 7; // 0 = Monday
  dt.setDate(dt.getDate() - mondayOffset);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function previousWeekStart(monday: string): string {
  const [y, m, d] = monday.split("-").map(Number);
  const dt = new Date(y, m - 1, d - 7);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Local YYYY-MM-DD for a review log's completed_at timestamp. */
export function reviewDateLocal(completedAt: string): string {
  const dt = new Date(completedAt);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Consecutive calendar weeks (ending now) with at least one completed
 * review. The current week counts if it has one, and doesn't break the
 * streak while it's still in progress if it doesn't yet.
 */
export function reviewStreakWeeks(completedAts: string[], today: string): number {
  const weeks = new Set(completedAts.map((ts) => weekStart(reviewDateLocal(ts))));
  if (weeks.size === 0) return 0;

  let cursor = weekStart(today);
  let streak = 0;
  if (weeks.has(cursor)) streak += 1;
  // Whether or not this week has one yet, the streak continues from last week.
  cursor = previousWeekStart(cursor);
  while (weeks.has(cursor)) {
    streak += 1;
    cursor = previousWeekStart(cursor);
  }
  return streak;
}
