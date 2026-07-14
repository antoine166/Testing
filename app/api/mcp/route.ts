import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAdminClient } from "@/lib/supabase/admin";
import { corsHeaders, verifyAccessToken } from "@/lib/mcp/oauth";
import { buildMcpServer } from "@/lib/mcp/tools";

function methodNotAllowed() {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
    { status: 405, headers: corsHeaders() },
  );
}

function unauthorized(origin: string) {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null },
    {
      status: 401,
      headers: {
        ...corsHeaders(),
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    },
  );
}

// Remote MCP server for claude.ai / Claude Desktop custom connectors — lets
// Claude read and manage Antoine's tasks/habits/check-ins directly. Auth is
// a normal OAuth 2.1 + PKCE access token (see app/api/mcp/{register,
// authorize,token}/route.ts), issued only after Antoine logs in with his
// existing Supabase account — there's no separate concept of "which user"
// beyond that, since this is a single-user app.
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return unauthorized(origin);
  }

  const admin = createAdminClient();
  const auth = await verifyAccessToken(admin, token);
  if (!auth) {
    return unauthorized(origin);
  }

  try {
    const server = buildMcpServer(admin, auth.userId);
    const transport = new WebStandardStreamableHTTPServerTransport();
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    for (const [key, value] of Object.entries(corsHeaders())) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: err instanceof Error ? err.message : "Internal server error" },
        id: null,
      },
      { status: 500, headers: corsHeaders() },
    );
  }
}

export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
