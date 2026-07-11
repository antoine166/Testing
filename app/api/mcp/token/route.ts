import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeAuthorizationCode, corsHeaders, issueTokens, rotateRefreshToken, verifyPkce } from "@/lib/mcp/oauth";

function errorResponse(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status, headers: corsHeaders() });
}

// Token endpoint — exchanges an authorization code (+ PKCE verifier) or a
// refresh token for an access token. Public client (no client_secret):
// PKCE is what proves the caller is the same one that started the flow.
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return errorResponse("invalid_request", "Expected application/x-www-form-urlencoded body");
  }

  const body = new URLSearchParams(await request.text());
  const grantType = body.get("grant_type");
  const clientId = body.get("client_id");

  if (!clientId) {
    return errorResponse("invalid_client", "client_id is required");
  }

  const admin = createAdminClient();

  if (grantType === "authorization_code") {
    const code = body.get("code");
    const codeVerifier = body.get("code_verifier");
    if (!code || !codeVerifier) {
      return errorResponse("invalid_request", "code and code_verifier are required");
    }

    const authorization = await consumeAuthorizationCode(admin, { code, clientId });
    if (!authorization) {
      return errorResponse("invalid_grant", "Authorization code is invalid, expired, or already used");
    }
    if (!verifyPkce(codeVerifier, authorization.codeChallenge)) {
      return errorResponse("invalid_grant", "code_verifier does not match the challenge");
    }

    const tokens = await issueTokens(admin, {
      clientId,
      userId: authorization.userId,
      resource: authorization.resource,
    });
    return NextResponse.json(tokens, { headers: corsHeaders() });
  }

  if (grantType === "refresh_token") {
    const refreshToken = body.get("refresh_token");
    if (!refreshToken) {
      return errorResponse("invalid_request", "refresh_token is required");
    }

    const tokens = await rotateRefreshToken(admin, { refreshToken, clientId });
    if (!tokens) {
      return errorResponse("invalid_grant", "Refresh token is invalid or expired");
    }
    return NextResponse.json(tokens, { headers: corsHeaders() });
  }

  return errorResponse("unsupported_grant_type", "Only authorization_code and refresh_token are supported");
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
