import type { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = ReturnType<typeof createAdminClient>;

// gmail.metadata: enough to look a message up by RFC822 Message-ID and
// read its Gmail-internal ID (for building a permalink) — no message
// content is ever fetched. userinfo.email: just enough to know *which*
// Google account was connected, so multiple connections can be told apart
// and disconnected individually — no other profile data is requested.
export const GMAIL_SCOPE =
  "https://www.googleapis.com/auth/gmail.metadata https://www.googleapis.com/auth/userinfo.email";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

export function isGmailConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  // Forces the consent screen every time so Google always issues a fresh
  // refresh_token — without this, reconnecting after a prior grant can come
  // back with no refresh_token at all (Google only issues one on first consent).
  // Also lets Antoine pick a *different* Google account when connecting a
  // second one, instead of silently reusing whichever one is already
  // signed into the browser.
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

export async function exchangeCodeForTokens(
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

/** Fetches the connected Google account's email address, so a connection can be identified and told apart from others. Best-effort — returns null on any failure rather than blocking the connect flow over a non-essential detail. */
export async function fetchGoogleAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.email === "string" ? data.email : null;
  } catch {
    return null;
  }
}

/**
 * Returns a valid access token for one specific Gmail connection (by row
 * id), refreshing it first if it's expired (or close to it). Returns null
 * if the connection doesn't exist. Uses the admin client since this runs
 * from the inbound email webhook, which has no user session.
 */
export async function getValidAccessToken(
  admin: AdminClient,
  connectionId: string,
): Promise<string | null> {
  const { data: connection } = await admin
    .from("gmail_connections")
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
    .from("gmail_connections")
    .update({ access_token: refreshed.access_token, expires_at: newExpiresAt })
    .eq("id", connectionId);

  return refreshed.access_token;
}

/**
 * Looks up a forwarded email by its RFC822 Message-ID across every Gmail
 * account Antoine has connected (it could plausibly have come from any of
 * them), and returns a permalink to whichever one finds it. Best-effort:
 * returns undefined if there's no connection, no match in any of them, or
 * an API error — callers should already have a fallback (see extractLink
 * in the inbound webhook).
 */
export async function findGmailPermalink(
  admin: AdminClient,
  userId: string,
  rfc822MessageId: string,
): Promise<string | undefined> {
  const { data: connections } = await admin
    .from("gmail_connections")
    .select("id")
    .eq("user_id", userId);
  if (!connections || connections.length === 0) return undefined;

  for (const connection of connections) {
    try {
      const accessToken = await getValidAccessToken(admin, connection.id);
      if (!accessToken) continue;

      const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      listUrl.searchParams.set("q", `rfc822msgid:${rfc822MessageId}`);
      listUrl.searchParams.set("maxResults", "1");

      const res = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) continue;

      const data = await res.json();
      const gmailId = data.messages?.[0]?.id;
      if (!gmailId) continue;

      return `https://mail.google.com/mail/u/0/#all/${gmailId}`;
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function disconnectGmail(supabase: SupabaseClient, connectionId: string): Promise<void> {
  await supabase.from("gmail_connections").delete().eq("id", connectionId);
}
