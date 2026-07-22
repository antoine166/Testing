import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/require-user";
import { buildCalendarAuthorizeUrl, isGoogleCalendarConfigured } from "@/lib/google-calendar/client";

const STATE_COOKIE = "gcal_oauth_state";

// Kicks off connecting a Google Calendar account (SCOPE.md §3.5a) — same
// flow shape as /api/gmail/connect. Google redirects back to
// /api/google-calendar/callback, which must be an authorized redirect URI
// on the OAuth client in Google Cloud Console.
export async function GET(request: Request) {
  const { user } = await requireUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google Calendar isn't configured yet — GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are missing.",
      },
      { status: 503 },
    );
  }

  const state = randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/google-calendar",
  });

  const redirectUri = new URL("/api/google-calendar/callback", request.url).toString();
  return NextResponse.redirect(buildCalendarAuthorizeUrl(redirectUri, state));
}
