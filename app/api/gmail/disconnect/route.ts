import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { disconnectGmail } from "@/lib/gmail/client";

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const connectionId = typeof body.connection_id === "string" ? body.connection_id : "";
  if (!connectionId) {
    return NextResponse.json({ error: "connection_id is required" }, { status: 400 });
  }

  // RLS (owner_delete) already scopes this to the caller's own rows —
  // no separate user_id check needed.
  await disconnectGmail(supabase, connectionId);
  return new NextResponse(null, { status: 204 });
}
