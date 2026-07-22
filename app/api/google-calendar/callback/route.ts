import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/require-user";
import {
  exchangeCalendarCodeForTokens,
  fetchGoogleAccountEmail,
  fetchPrimaryCalendarTimeZone,
} from "@/lib/google-calendar/client";

const STATE_COOKIE = "gcal_oauth_state";

export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  const settingsUrl = (status: string) => new URL(`/settings?gcal=${status}`, request.url);

  if (oauthError) {
    return NextResponse.redirect(settingsUrl("denied"));
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(settingsUrl("error"));
  }

  try {
    const redirectUri = new URL("/api/google-calendar/callback", request.url).toString();
    const tokens = await exchangeCalendarCodeForTokens(code, redirectUri);

    if (!tokens.refresh_token) {
      // Same reasoning as the Gmail callback: without a refresh token the
      // connection dies within the hour — fail loudly instead.
      return NextResponse.redirect(settingsUrl("error"));
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const email = await fetchGoogleAccountEmail(tokens.access_token);
    const timeZone = await fetchPrimaryCalendarTimeZone(tokens.access_token);

    const row = {
      user_id: user.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scope: tokens.scope,
      email,
      time_zone: timeZone,
      updated_at: new Date().toISOString(),
    };

    // Reconnecting the same account updates in place; a different account
    // becomes a new row (same multi-account model as gmail_connections,
    // including deliberately not adopting legacy null-email rows).
    const { data: existing } = await supabase
      .from("google_calendar_connections")
      .select("id, email")
      .eq("user_id", user.id);

    const targetId = existing?.find((c) => c.email === email)?.id;

    const { error: dbError } = targetId
      ? await supabase.from("google_calendar_connections").update(row).eq("id", targetId)
      : await supabase.from("google_calendar_connections").insert(row);
    if (dbError) {
      return NextResponse.redirect(settingsUrl("error"));
    }

    return NextResponse.redirect(settingsUrl("connected"));
  } catch (err) {
    console.error("Google Calendar OAuth callback failed:", err);
    return NextResponse.redirect(settingsUrl("error"));
  }
}
