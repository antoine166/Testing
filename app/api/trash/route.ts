import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { TRASH_CONFIG, TRASH_TYPES } from "@/lib/trash";

type TrashItem = {
  id: string;
  type: string;
  name: string;
  deleted_at: string;
};

export async function GET() {
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await Promise.all(
    TRASH_TYPES.map((type) => {
      const { table, nameField } = TRASH_CONFIG[type];
      return supabase
        .from(table)
        .select(`id, ${nameField}, deleted_at`)
        .not("deleted_at", "is", null);
    }),
  );

  const items: TrashItem[] = [];

  results.forEach((res, i) => {
    const type = TRASH_TYPES[i];
    const { nameField } = TRASH_CONFIG[type];
    if (res.error || !res.data) return;
    for (const row of res.data as unknown as Record<string, unknown>[]) {
      items.push({
        id: row.id as string,
        type,
        name: (row[nameField] as string) || "(untitled)",
        deleted_at: row.deleted_at as string,
      });
    }
  });

  items.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));

  return NextResponse.json(items);
}
