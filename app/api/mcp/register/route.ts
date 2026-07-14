import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { corsHeaders, registerClient } from "@/lib/mcp/oauth";

// RFC 7591 Dynamic Client Registration — claude.ai calls this automatically
// the first time you add the connector. Anyone can register a client (that's
// how DCR works), but a registered client still can't get a token without
// Antoine logging in at /api/mcp/authorize, so this alone grants no access.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Body must be JSON" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const metadata = body as Record<string, unknown>;
  const redirectUris = Array.isArray(metadata.redirect_uris) ? metadata.redirect_uris : [];
  const validUris = redirectUris.filter((uri): uri is string => typeof uri === "string" && URL.canParse(uri));

  if (validUris.length === 0) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "redirect_uris must contain at least one valid URL" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const clientName = typeof metadata.client_name === "string" ? metadata.client_name : undefined;

  const admin = createAdminClient();
  const client = await registerClient(admin, { redirectUris: validUris, clientName });

  return NextResponse.json(
    {
      client_id: client.client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: client.redirect_uris,
      client_name: client.client_name ?? undefined,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: corsHeaders() },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
