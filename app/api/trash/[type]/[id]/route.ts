import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { TRASH_CONFIG, isTrashType } from "@/lib/trash";
import {
  findCalendarAffectedTaskIds,
  syncTaskCalendarEvent,
  syncTaskCalendarEvents,
} from "@/lib/google-calendar/sync";

type RouteParams = { params: Promise<{ type: string; id: string }> };

/**
 * Restoring or purging can change which tasks are "live" without going
 * through the task routes, so the Google Calendar reconcile has to ride
 * along here too: restore brings events back for time-blocked tasks, purge
 * clears any event still linked to a row that's about to be gone forever.
 */
async function syncCalendarForTrashChange(userId: string, type: string, id: string) {
  if (type === "task") {
    await syncTaskCalendarEvent(userId, id);
  } else if (type === "project") {
    await syncTaskCalendarEvents(userId, await findCalendarAffectedTaskIds(userId, { projectId: id }));
  } else if (type === "domain") {
    await syncTaskCalendarEvents(userId, await findCalendarAffectedTaskIds(userId, { domainId: id }));
  }
}

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
    await syncCalendarForTrashChange(user.id, type, id);
    return new NextResponse(null, { status: 204 });
  }

  const { error } = await supabase
    .from(config.table)
    .update({ deleted_at: null })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await syncCalendarForTrashChange(user.id, type, id);

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

  // Before the rows are gone for good: the tasks are still (soft-)deleted
  // records right now, so the reconcile can still find and remove any
  // Google Calendar event linked to them. After a hard delete it couldn't.
  await syncCalendarForTrashChange(user.id, type, id);

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
