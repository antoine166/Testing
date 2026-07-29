import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

/**
 * Lightweight read of one list's saved positions (#142) — what the pages'
 * useListOrder hook fetches so they can applyListOrder() client-side
 * without re-downloading the tasks themselves. RLS scopes rows to the
 * signed-in user.
 */
export async function GET(request: Request) {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const listKey = new URL(request.url).searchParams.get("list_key");
  if (!listKey) {
    return NextResponse.json({ error: "list_key is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("list_orders")
    .select("item_id, item_type, position")
    .eq("list_key", listKey);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
