import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { listGoogleCalendarEvents } from "@/lib/google-calendar/sync";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Google events for the Life OS calendar view. Fetched live per request —
// no local event storage, so there's no sync state to corrupt; the page
// simply shows whatever Google says right now.
export async function GET(request: Request) {
  const { user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) {
    return NextResponse.json(
      { error: "start and end must be YYYY-MM-DD with start <= end" },
      { status: 400 },
    );
  }

  const events = await listGoogleCalendarEvents(user.id, start, end);
  if (events === null) {
    // Not connected — the calendar page treats this as "no events, no
    // error" and shows a one-time connect hint instead.
    return NextResponse.json({ connected: false, events: [] });
  }

  return NextResponse.json({ connected: true, events });
}
