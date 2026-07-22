import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

// Disconnect one Google Calendar account. Like Gmail disconnect, this is a
// deliberately app-only action (CLAUDE.md's manual-only list: account
// settings) — no MCP/Coach tool calls this.
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const connectionId = typeof body.connection_id === "string" ? body.connection_id : null;
  if (!connectionId) {
    return NextResponse.json({ error: "connection_id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("google_calendar_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
