type LogResult = { ok: true } | { ok: false; error: string };

/** POSTs a habit log for a day. Multiple calls for the same day add "extra credit" (up to 7/day, enforced server-side). */
export async function postHabitLog(habitId: string, date: string): Promise<LogResult> {
  const res = await fetch("/api/habit-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ habit_id: habitId, date }),
  });

  if (!res.ok) {
    const body = await res.json();
    return { ok: false, error: body.error ?? "Failed to update log" };
  }
  return { ok: true };
}

/** Removes the most recently added log for a day, leaving any earlier ones (extra credit) in place. */
export async function deleteHabitLog(habitId: string, date: string): Promise<LogResult> {
  const res = await fetch(`/api/habit-logs?habit_id=${habitId}&date=${date}`, { method: "DELETE" });

  if (!res.ok) {
    const body = await res.json();
    return { ok: false, error: body.error ?? "Failed to update log" };
  }
  return { ok: true };
}
