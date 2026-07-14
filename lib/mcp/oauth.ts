import { randomBytes, randomUUID, createHash, timingSafeEqual } from "crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export const AUTH_CODE_TTL_SECONDS = 10 * 60;
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60; // 6 months

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function constantTimeEqual(a: string, b: string): boolean {
  // Hashing both sides to a fixed-length digest avoids leaking length via
  // timingSafeEqual's own size requirement.
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

/** PKCE S256: verifier is valid if base64url(sha256(verifier)) matches the stored challenge. */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  return constantTimeEqual(computed, codeChallenge);
}

export function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export type OAuthClient = {
  client_id: string;
  redirect_uris: string[];
  client_name: string | null;
};

export async function registerClient(
  admin: AdminClient,
  params: { redirectUris: string[]; clientName?: string },
): Promise<OAuthClient> {
  const { data, error } = await admin
    .from("mcp_oauth_clients")
    .insert({ client_id: randomUUID(), redirect_uris: params.redirectUris, client_name: params.clientName })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getClient(admin: AdminClient, clientId: string): Promise<OAuthClient | null> {
  const { data } = await admin
    .from("mcp_oauth_clients")
    .select("client_id, redirect_uris, client_name")
    .eq("client_id", clientId)
    .maybeSingle();
  return data;
}

export async function createAuthorizationCode(
  admin: AdminClient,
  params: { clientId: string; userId: string; redirectUri: string; codeChallenge: string; resource?: string | null },
): Promise<string> {
  const code = randomToken();
  const { error } = await admin.from("mcp_oauth_codes").insert({
    code_hash: sha256(code),
    client_id: params.clientId,
    user_id: params.userId,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    resource: params.resource ?? null,
    expires_at: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return code;
}

export async function consumeAuthorizationCode(
  admin: AdminClient,
  params: { code: string; clientId: string },
): Promise<{ userId: string; redirectUri: string; codeChallenge: string; resource: string | null } | null> {
  const codeHash = sha256(params.code);
  const { data, error } = await admin
    .from("mcp_oauth_codes")
    .select("*")
    .eq("code_hash", codeHash)
    .eq("client_id", params.clientId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.used_at) return null; // single-use
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  await admin.from("mcp_oauth_codes").update({ used_at: new Date().toISOString() }).eq("code_hash", codeHash);

  return {
    userId: data.user_id,
    redirectUri: data.redirect_uri,
    codeChallenge: data.code_challenge,
    resource: data.resource,
  };
}

export type IssuedTokens = {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
};

export async function issueTokens(
  admin: AdminClient,
  params: { clientId: string; userId: string; resource?: string | null },
): Promise<IssuedTokens> {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  const now = Date.now();

  const { error } = await admin.from("mcp_oauth_tokens").insert({
    access_token_hash: sha256(accessToken),
    refresh_token_hash: sha256(refreshToken),
    client_id: params.clientId,
    user_id: params.userId,
    resource: params.resource ?? null,
    expires_at: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
    refresh_expires_at: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);

  return { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS };
}

/** Refresh token rotation: the old token row is replaced by a freshly issued pair. */
export async function rotateRefreshToken(
  admin: AdminClient,
  params: { refreshToken: string; clientId: string },
): Promise<IssuedTokens | null> {
  const refreshHash = sha256(params.refreshToken);
  const { data, error } = await admin
    .from("mcp_oauth_tokens")
    .select("access_token_hash, user_id, resource, refresh_expires_at")
    .eq("refresh_token_hash", refreshHash)
    .eq("client_id", params.clientId)
    .maybeSingle();
  if (error || !data) return null;
  if (!data.refresh_expires_at || new Date(data.refresh_expires_at).getTime() < Date.now()) return null;

  await admin.from("mcp_oauth_tokens").delete().eq("access_token_hash", data.access_token_hash);

  return issueTokens(admin, { clientId: params.clientId, userId: data.user_id, resource: data.resource });
}

export async function verifyAccessToken(
  admin: AdminClient,
  token: string,
): Promise<{ userId: string; clientId: string } | null> {
  const { data, error } = await admin
    .from("mcp_oauth_tokens")
    .select("user_id, client_id, expires_at")
    .eq("access_token_hash", sha256(token))
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return { userId: data.user_id, clientId: data.client_id };
}
