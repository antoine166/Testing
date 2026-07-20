export function todayLocal(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** Whole days between `date` (YYYY-MM-DD) and today, local time. */
export function daysSince(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const then = new Date(year, month - 1, day);
  const now = new Date();
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ms = nowLocal.getTime() - then.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/** Last N local calendar dates (YYYY-MM-DD), oldest first, including today. */
export function lastNDays(n: number): string[] {
  const today = todayLocal();
  const [year, month, day] = today.split("-").map(Number);
  const base = new Date(year, month - 1, day);

  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${dd}`);
  }
  return dates;
}

/** The last 7 dates (YYYY-MM-DD) ending on `today`, oldest first — a rolling window, not the calendar Monday-Sunday week. */
export function lastSevenDays(today: string): string[] {
  const [year, month, day] = today.split("-").map(Number);
  const end = new Date(year, month - 1, day);

  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${dd}`);
  }
  return days;
}
