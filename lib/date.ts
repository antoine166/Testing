export function todayLocal(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
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
