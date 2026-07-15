import type { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = ReturnType<typeof createAdminClient>;

// Least-privilege scope: metadata-only read access is enough to look a
// message up by its RFC822 Message-ID and read its Gmail-internal ID (for
// building a permalink) — no message content is ever fetched.
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.metadata";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

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
  url.searchParams.set("prompt", "consent");
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

/**
 * Returns a valid access token for the user's stored Gmail connection,
 * refreshing it first if it's expired (or close to it). Returns null if
 * the user has no connection. Uses the admin client since this runs from
 * the inbound email webhook, which has no user session.
 */
export async function getValidAccessToken(
  admin: AdminClient,
  userId: string,
): Promise<string | null> {
  const { data: connection } = await admin
    .from("gmail_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
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
    .eq("user_id", userId);

  return refreshed.access_token;
}

/**
 * Looks up a forwarded email in the user's connected Gmail account by its
 * RFC822 Message-ID header, and returns a permalink Antoine can open
 * directly in Gmail. Best-effort: returns undefined on any failure (no
 * connection, message not found, API error) — callers should already have
 * a fallback (see extractLink in the inbound webhook).
 */
export async function findGmailPermalink(
  admin: AdminClient,
  userId: string,
  rfc822MessageId: string,
): Promise<string | undefined> {
  try {
    const accessToken = await getValidAccessToken(admin, userId);
    if (!accessToken) return undefined;

    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("q", `rfc822msgid:${rfc822MessageId}`);
    listUrl.searchParams.set("maxResults", "1");

    const res = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return undefined;

    const data = await res.json();
    const gmailId = data.messages?.[0]?.id;
    if (!gmailId) return undefined;

    return `https://mail.google.com/mail/u/0/#all/${gmailId}`;
  } catch {
    return undefined;
  }
}

export async function disconnectGmail(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase.from("gmail_connections").delete().eq("user_id", userId);
}
