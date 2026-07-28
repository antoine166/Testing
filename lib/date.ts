/**
 * Prefer a client-supplied YYYY-MM-DD over a server-computed fallback.
 *
 * Server routes run in UTC, so "today" computed there is wrong for
 * Antoine every evening (10pm Eastern is already tomorrow in UTC — the
 * #112 item 4 bug). Clients send `client_date: todayLocal()` alongside
 * requests that need a date stamp; routes resolve it through this so a
 * missing or malformed value degrades to the old server behavior
 * instead of storing garbage.
 */
export function clientDateOr(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const [year, month, day] = value.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  const roundTrips =
    d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  return roundTrips ? value : fallback;
}

/** Add n days (may be negative) to a YYYY-MM-DD date string. */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** Add n days (may be negative) to a Date, returning a new Date. */
export function addDaysDate(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** "2026-07-15" (or a full timestamp) -> "July 2026". */
export function monthLabel(dateStr: string): string {
  const [year, month] = dateStr.split("T")[0].split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

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
