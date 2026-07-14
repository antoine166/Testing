import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Route Handlers (unlike Server Components) are allowed to set cookies, so
// calling getUser() here actually persists a refreshed session back to the
// browser instead of the refresh being computed and silently discarded.
// Pinged periodically by components/session-refresh.tsx.
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.getUser();
  return new NextResponse(null, { status: 204 });
}
