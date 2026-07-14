import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/mcp/oauth";

// RFC 9728 Protected Resource Metadata — tells an MCP client which
// authorization server issues tokens for /api/mcp. Served at
// /.well-known/oauth-protected-resource via the rewrite in next.config.ts
// (Next.js's App Router doesn't route dot-prefixed folders).
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  return NextResponse.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
    },
    { headers: corsHeaders() },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
