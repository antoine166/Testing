import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import {
  findCalendarAffectedTaskIds,
  syncTaskCalendarEvents,
} from "@/lib/google-calendar/sync";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, string | null> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    updates.name = name;
  }
  if (typeof body.description === "string") {
    updates.description = body.description;
  }
  if (typeof body.purpose === "string") {
    updates.purpose = body.purpose;
  }
  if (typeof body.outcome_vision === "string") {
    updates.outcome_vision = body.outcome_vision;
  }
  if (typeof body.brainstorm === "string") {
    updates.brainstorm = body.brainstorm;
  }
  if ("domain_id" in body) {
    updates.domain_id = typeof body.domain_id === "string" ? body.domain_id : null;
  }
  if ("parent_project_id" in body) {
    updates.parent_project_id =
      typeof body.parent_project_id === "string" ? body.parent_project_id : null;
  }
  if (typeof body.status === "string") {
    updates.status = body.status;
  }
  if (typeof body.priority === "string") {
    updates.priority = body.priority;
  }
  if ("due_date" in body) {
    updates.due_date = typeof body.due_date === "string" ? body.due_date : null;
  }
  if ("scheduled_date" in body) {
    updates.scheduled_date = typeof body.scheduled_date === "string" ? body.scheduled_date : null;
  }
  if ("link" in body) {
    updates.link = typeof body.link === "string" && body.link.trim() ? body.link.trim() : null;
  }
  if ("review_every_days" in body) {
    const n = Number(body.review_every_days);
    if (body.review_every_days !== null && (!Number.isInteger(n) || n <= 0)) {
      return NextResponse.json(
        { error: "review_every_days must be a positive whole number or null" },
        { status: 400 },
      );
    }
    (updates as Record<string, unknown>).review_every_days =
      body.review_every_days === null ? null : n;
  }
  if (body.mark_reviewed === true) {
    updates.last_reviewed_at = new Date().toISOString();
  }

  // Completed-project lifecycle: the server stamps completed_at centrally so
  // every client (app pages, MCP) gets it for free — clients just PUT status.
  if (typeof updates.status === "string") {
    if (updates.status === "completed") {
      const { data: existing } = await supabase
        .from("projects")
        .select("status")
        .eq("id", id)
        .single();
      if (existing?.status !== "completed") {
        updates.completed_at = new Date().toISOString();
      }
    } else {
      // Reopening (any non-completed status) clears the stamp.
      updates.completed_at = null;
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Completing a project completes its remaining open tasks (Antoine's
  // rule: a done project has no open work — the tasks stay tagged to it
  // and land in the Logbook alongside it). Direct tasks only; subprojects
  // are their own projects and complete on their own. Runs after the
  // project update so a failed update can't half-complete the list. The
  // per-task PUT's recurring "spawn next occurrence" step is deliberately
  // skipped — a finished project shouldn't generate new work.
  if (typeof updates.completed_at === "string") {
    const affected = await findCalendarAffectedTaskIds(user.id, { projectId: id });
    const { error: tasksError } = await supabase
      .from("tasks")
      .update({ status: "done", completed_at: updates.completed_at })
      .eq("project_id", id)
      .is("deleted_at", null)
      .neq("status", "done");
    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 500 });
    }
    // Time-blocked tasks may have pushed Google Calendar events — completing
    // them changes what should be on the calendar, same as the delete path.
    await syncTaskCalendarEvents(user.id, affected);
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.rpc("trash_project", { p_project_id: id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The cascade just trashed this project's (and subprojects') tasks —
  // remove any Google Calendar events pushed for time-blocked ones.
  await syncTaskCalendarEvents(user.id, await findCalendarAffectedTaskIds(user.id, { projectId: id }));

  return new NextResponse(null, { status: 204 });
}
