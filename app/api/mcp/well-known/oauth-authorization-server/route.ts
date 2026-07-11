import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/mcp/oauth";

// RFC 8414 Authorization Server Metadata for the OAuth server backing
// /api/mcp — this app acts as its own authorization server, gated by the
// existing Supabase Auth login (see app/api/mcp/authorize/route.ts). Served
// at /.well-known/oauth-authorization-server via the rewrite in
// next.config.ts (Next.js's App Router doesn't route dot-prefixed folders).
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/api/mcp/authorize`,
      token_endpoint: `${origin}/api/mcp/token`,
      registration_endpoint: `${origin}/api/mcp/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    },
    { headers: corsHeaders() },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
