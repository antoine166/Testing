import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAuthorizationCode, getClient } from "@/lib/mcp/oauth";

// Authorization endpoint for the OAuth flow claude.ai drives when you add
// the connector. Gated by the same Supabase Auth login as the rest of the
// app — if Antoine isn't already logged in, this bounces to /login and
// back. No separate "allow access" screen: reaching this page already
// requires his login, and only he can ever have this URL open.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const clientId = params.get("client_id");
  const responseType = params.get("response_type");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");
  const state = params.get("state");
  const resource = params.get("resource");
  const requestedRedirectUri = params.get("redirect_uri");

  if (!clientId) {
    return NextResponse.json({ error: "invalid_request", error_description: "client_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const client = await getClient(admin, clientId);
  if (!client) {
    return NextResponse.json({ error: "invalid_client", error_description: "Unknown client_id" }, { status: 400 });
  }

  const redirectUri = requestedRedirectUri ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : null);
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Unregistered redirect_uri" },
      { status: 400 },
    );
  }

  function redirectWithError(error: string, description: string) {
    const dest = new URL(redirectUri!);
    dest.searchParams.set("error", error);
    dest.searchParams.set("error_description", description);
    if (state) dest.searchParams.set("state", state);
    return NextResponse.redirect(dest.toString());
  }

  if (responseType !== "code") {
    return redirectWithError("unsupported_response_type", "Only response_type=code is supported");
  }
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return redirectWithError("invalid_request", "PKCE (code_challenge_method=S256) is required");
  }

  const { user } = await requireUser();
  if (!user) {
    const next = `${url.pathname}${url.search}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, url.origin));
  }

  const code = await createAuthorizationCode(admin, {
    clientId,
    userId: user.id,
    redirectUri,
    codeChallenge,
    resource,
  });

  const dest = new URL(redirectUri);
  dest.searchParams.set("code", code);
  if (state) dest.searchParams.set("state", state);
  return NextResponse.redirect(dest.toString());
}
