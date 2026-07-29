import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

/**
 * Bulk manual reorder for habits (#142): the full habit id list in display
 * order, stamped sort_order = index. Habits keep ONE global order (the
 * approved cut — no per-page list_key here); pages layer their own safety
 * sorts (at-risk first) on top of it.
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const ids: unknown = body.ids;

  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 200 ||
    !ids.every((id) => typeof id === "string")
  ) {
    return NextResponse.json({ error: "ids must be a list of habit ids" }, { status: 400 });
  }

  const results = await Promise.all(
    (ids as string[]).map((id, index) =>
      supabase.from("habits").update({ sort_order: index }).eq("id", id),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
