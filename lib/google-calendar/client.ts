import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// calendar.events: read events for the Life OS calendar view and write the
// events that time-blocked tasks are pushed as — no access to calendar
// settings/sharing beyond that. userinfo.email: same as the Gmail
// connection, just enough to tell connected accounts apart.
export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export function isGoogleCalendarConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function buildCalendarAuthorizeUrl(redirectUri: string, state: string): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_SCOPE);
  url.searchParams.set("access_type", "offline");
  // prompt=consent guarantees a refresh_token on every connect (Google only
  // issues one on first consent otherwise); select_account lets a different
  // Google account be picked instead of silently reusing the signed-in one.
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export async function exchangeCalendarCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** Best-effort, like the Gmail equivalent — identifies which account was connected. */
export async function fetchGoogleAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.email === "string" ? data.email : null;
  } catch {
    return null;
  }
}

/**
 * The primary calendar's IANA timezone, captured once at connect time —
 * pushed events need an explicit timeZone since tasks only store local
 * wall time. Best-effort: null just means pushes fall back to UTC offsets
 * being wrong, which the sync layer guards against by refusing to push
 * without a timezone.
 */
export async function fetchPrimaryCalendarTimeZone(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${CALENDAR_API}/calendars/primary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.timeZone === "string" ? data.timeZone : null;
  } catch {
    return null;
  }
}

/**
 * Valid access token for one calendar connection, refreshing if expired —
 * same shape as lib/gmail/client.ts's getValidAccessToken. Admin client
 * because sync runs from server routes and MCP/Coach tool handlers.
 */
export async function getValidCalendarAccessToken(
  admin: AdminClient,
  connectionId: string,
): Promise<string | null> {
  const { data: connection } = await admin
    .from("google_calendar_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection) return null;

  const expiresAt = new Date(connection.expires_at).getTime();
  const oneMinute = 60 * 1000;
  if (expiresAt - Date.now() > oneMinute) {
    return connection.access_token;
  }

  const refreshed = await refreshAccessToken(connection.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await admin
    .from("google_calendar_connections")
    .update({ access_token: refreshed.access_token, expires_at: newExpiresAt })
    .eq("id", connectionId);

  return refreshed.access_token;
}

export { CALENDAR_API };
