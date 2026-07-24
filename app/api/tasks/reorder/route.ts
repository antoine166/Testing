import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

/**
 * Bulk manual reorder: takes the full id list of a hand-arranged view (in
 * display order) and stamps sort_order = index on each. A dedicated
 * endpoint rather than N PUTs to /api/tasks/[id], because that route runs
 * calendar sync on every write — pure position changes don't need it.
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
    ids.length > 500 ||
    !ids.every((id) => typeof id === "string")
  ) {
    return NextResponse.json({ error: "ids must be a list of task ids" }, { status: 400 });
  }

  const results = await Promise.all(
    (ids as string[]).map((id, index) =>
      supabase.from("tasks").update({ sort_order: index }).eq("id", id),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
