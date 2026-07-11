import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedMcpRequest } from "@/lib/mcp/auth";
import { buildMcpServer } from "@/lib/mcp/tools";

function methodNotAllowed() {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
    { status: 405 },
  );
}

// Remote MCP server for claude.ai / Claude Desktop custom connectors — lets
// Claude read and manage Antoine's tasks/habits/check-ins directly. No user
// session exists here (Claude calls this over the internet on its own), so
// auth is a shared bearer token (see lib/mcp/auth.ts) and data access goes
// through the service-role admin client, same pattern as the inbound email
// webhook. Single-user app: the token owns whichever account exists.
export async function POST(request: Request) {
  if (!isAuthorizedMcpRequest(request)) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  const { data: users, error: usersError } = await admin.auth.admin.listUsers();
  const owner = users?.users[0];
  if (usersError || !owner) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "No account to connect to" }, id: null },
      { status: 500 },
    );
  }

  try {
    const server = buildMcpServer(admin, owner.id);
    const transport = new WebStandardStreamableHTTPServerTransport();
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (err) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: err instanceof Error ? err.message : "Internal server error" },
        id: null,
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
