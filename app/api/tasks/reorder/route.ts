import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

/**
 * Bulk manual reorder: takes the full id list of a hand-arranged view (in
 * display order). With a `list_key` (#142) it saves per-page positions in
 * list_orders (position = index, upsert only — ids missing from the list
 * simply keep their old rows, which applyListOrder ignores once the item
 * left the list). Without one it stamps the legacy global tasks.sort_order,
 * exactly as before, so old callers keep working. A dedicated endpoint
 * rather than N PUTs to /api/tasks/[id], because that route runs calendar
 * sync on every write — pure position changes don't need it.
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

  const listKey: unknown = body.list_key;
  if (listKey !== undefined) {
    if (typeof listKey !== "string" || !listKey.trim() || listKey.length > 200) {
      return NextResponse.json({ error: "list_key must be a short string" }, { status: 400 });
    }
    const rows = (ids as string[]).map((id, index) => ({
      user_id: user.id,
      list_key: listKey,
      item_type: "task",
      item_id: id,
      position: index,
    }));
    const { error } = await supabase
      .from("list_orders")
      .upsert(rows, { onConflict: "user_id,list_key,item_type,item_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
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
