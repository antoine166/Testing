import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { TRASH_CONFIG, isTrashType } from "@/lib/trash";

type RouteParams = { params: Promise<{ type: string; id: string }> };

export async function PATCH(_request: Request, { params }: RouteParams) {
  const { type, id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isTrashType(type)) {
    return NextResponse.json({ error: "Unknown trash type" }, { status: 400 });
  }

  const config = TRASH_CONFIG[type];

  if (config.restoreRpc && config.restoreRpcParam) {
    const { error } = await supabase.rpc(config.restoreRpc, {
      [config.restoreRpcParam]: id,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return new NextResponse(null, { status: 204 });
  }

  const { error } = await supabase
    .from(config.table)
    .update({ deleted_at: null })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { type, id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isTrashType(type)) {
    return NextResponse.json({ error: "Unknown trash type" }, { status: 400 });
  }

  const config = TRASH_CONFIG[type];

  if (config.purgeRpc && config.purgeRpcParam) {
    const { error } = await supabase.rpc(config.purgeRpc, {
      [config.purgeRpcParam]: id,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return new NextResponse(null, { status: 204 });
  }

  const { error } = await supabase.from(config.table).delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
