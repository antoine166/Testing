import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { disconnectGmail } from "@/lib/gmail/client";

export async function POST() {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await disconnectGmail(supabase, user.id);
  return new NextResponse(null, { status: 204 });
}
