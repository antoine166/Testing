import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ResurfacedNote = {
  id: string;
  title: string;
  content: string | null;
  url: string | null;
  type: string;
  updated_at: string;
};

// The classic external-brain failure: notes go in, nothing ever comes back
// out. This picks one Library item a day to resurface in the morning digest
// — deterministic for the day (the digest and the MCP summary agree), but
// rotating daily through the 30 least-recently-touched items so neglected
// notes get their turn instead of one stubborn oldest note repeating until
// it's edited.
export async function pickResurfacedNote(
  admin: AdminClient,
  userId: string,
  today: string,
): Promise<ResurfacedNote | null> {
  const { data } = await admin
    .from("knowledge_items")
    .select("id, title, content, url, type, updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: true })
    .limit(30);
  if (!data || data.length === 0) return null;

  const [y, m, d] = today.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  const item = data[dayNumber % data.length];

  return {
    ...item,
    content:
      item.content && item.content.length > 500 ? `${item.content.slice(0, 500)}…` : item.content,
  };
}
