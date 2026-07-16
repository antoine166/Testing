import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { constantTimeEqual } from "@/lib/mcp/oauth";

// Plain token-secured endpoint for the Chrome extension (chrome-extension/)
// to call directly — an extension page has no way to share the app's
// session cookie, so it authenticates with a personal access token
// instead, same pattern as /api/digest. Creates a task rather than a
// knowledge item, landing in the Inbox (no domain_id/project_id set) like
// any other unfiled capture, since that's where a clip should start —
// filing it into the Knowledge Library, a project, etc. happens from there.
export async function POST(request: Request) {
  const expected = process.env.EXTENSION_ACCESS_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Clipper isn't configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token || !constantTimeEqual(token, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: users, error: usersError } = await admin.auth.admin.listUsers();
  const owner = users?.users[0];
  if (usersError || !owner) {
    return NextResponse.json({ error: "No account to clip to" }, { status: 500 });
  }

  const { data, error } = await admin
    .from("tasks")
    .insert({
      user_id: owner.id,
      title,
      notes: typeof body.content === "string" ? body.content : undefined,
      link: typeof body.url === "string" ? body.url : undefined,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
