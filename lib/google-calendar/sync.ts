import { createAdminClient } from "@/lib/supabase/admin";
import { CALENDAR_API, getValidCalendarAccessToken } from "@/lib/google-calendar/client";

type AdminClient = ReturnType<typeof createAdminClient>;

const DEFAULT_BLOCK_MINUTES = 60;

// Marks pushed events so the pull side can exclude them — otherwise a
// time-blocked task would render twice on the Life OS calendar (once as
// itself, once as its own Google event).
const TASK_ID_PROP = "life_os_task_id";

/**
 * Events are pushed to exactly one connection (the oldest) even when
 * several accounts are connected for reading — one unambiguous home for
 * pushed blocks beats guessing which account a given task belongs on.
 */
async function getPushConnection(admin: AdminClient, userId: string) {
  const { data } = await admin
    .from("google_calendar_connections")
    .select("id, time_zone")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

function eventBody(
  task: { title: string; scheduled_date: string; scheduled_time: string; estimated_minutes: number | null; id: string },
  timeZone: string,
) {
  const start = new Date(`${task.scheduled_date}T${task.scheduled_time}`);
  const minutes = task.estimated_minutes ?? DEFAULT_BLOCK_MINUTES;
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const local = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
  return {
    summary: task.title,
    description: "Time-blocked in Life OS",
    start: { dateTime: local(start), timeZone },
    end: { dateTime: local(end), timeZone },
    extendedProperties: { private: { [TASK_ID_PROP]: task.id } },
  };
}

/**
 * Reconcile one task with Google Calendar: a task should have a linked
 * event exactly when it's live (not done, not trashed) and time-blocked
 * (scheduled_date + scheduled_time). Called after any task write from all
 * three surfaces (API routes, MCP connector, in-app Coach).
 *
 * Deliberately best-effort and silent: a Google hiccup must never fail or
 * slow-fail the task write it rides along with. Worst case is a stale
 * event that the next successful sync (or the user) cleans up.
 */
export async function syncTaskCalendarEvent(userId: string, taskId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const connection = await getPushConnection(admin, userId);
    if (!connection) return;

    const { data: task } = await admin
      .from("tasks")
      .select(
        "id, title, status, deleted_at, scheduled_date, scheduled_time, estimated_minutes, gcal_event_id",
      )
      .eq("id", taskId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!task) return;

    const shouldHaveEvent =
      task.status !== "done" &&
      !task.deleted_at &&
      !!task.scheduled_date &&
      !!task.scheduled_time;

    if (!shouldHaveEvent && !task.gcal_event_id) return;

    const accessToken = await getValidCalendarAccessToken(admin, connection.id);
    if (!accessToken) return;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    if (!shouldHaveEvent) {
      const res = await fetch(
        `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(task.gcal_event_id!)}`,
        { method: "DELETE", headers },
      );
      // 404/410: already gone on Google's side — fine, just unlink.
      if (res.ok || res.status === 404 || res.status === 410) {
        await admin.from("tasks").update({ gcal_event_id: null }).eq("id", task.id);
      }
      return;
    }

    // Without a timezone we'd write wall-clock times into an unknown zone —
    // worse than not pushing at all. (Only affects connections made before
    // the timezone fetch existed; reconnecting fixes it.)
    if (!connection.time_zone) return;

    const body = JSON.stringify(
      eventBody(
        task as {
          title: string;
          scheduled_date: string;
          scheduled_time: string;
          estimated_minutes: number | null;
          id: string;
        },
        connection.time_zone,
      ),
    );

    if (task.gcal_event_id) {
      const res = await fetch(
        `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(task.gcal_event_id)}`,
        { method: "PATCH", headers, body },
      );
      // Event was deleted directly in Google Calendar — recreate it, since
      // the task is still time-blocked in Life OS (the source of truth).
      if (res.status !== 404 && res.status !== 410) return;
    }

    const createRes = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
      method: "POST",
      headers,
      body,
    });
    if (createRes.ok) {
      const event = await createRes.json();
      if (typeof event.id === "string") {
        await admin.from("tasks").update({ gcal_event_id: event.id }).eq("id", task.id);
      }
    }
  } catch (err) {
    console.error("Google Calendar sync failed for task", taskId, err);
  }
}

/**
 * Batch form of syncTaskCalendarEvent for the paths that trash or restore
 * many tasks at once (recurring-series delete; project/domain trash,
 * restore, purge). Sequential on purpose: single-user volumes, and each
 * call is independently best-effort — one Google hiccup never blocks the
 * rest of the batch.
 */
export async function syncTaskCalendarEvents(userId: string, taskIds: string[]): Promise<void> {
  for (const taskId of taskIds) {
    await syncTaskCalendarEvent(userId, taskId);
  }
}

/**
 * Task ids whose Google event might need reconciling when a whole project
 * or domain is trashed, restored, or purged. Mirrors the scope of the
 * trash_project / trash_domain SQL cascades (a project includes its direct
 * subprojects; a domain includes its own tasks plus all of its projects').
 * Candidates are tasks that already have a linked event (trash/purge
 * direction) or are time-blocked and may need one back (restore direction);
 * syncTaskCalendarEvent makes the real per-task decision either way.
 * Deliberately ignores deleted_at so it gives the same answer before or
 * after the cascade runs.
 */
export async function findCalendarAffectedTaskIds(
  userId: string,
  scope: { projectId: string } | { domainId: string },
): Promise<string[]> {
  try {
    const admin = createAdminClient();

    const projectIds: string[] = [];
    if ("projectId" in scope) {
      projectIds.push(scope.projectId);
      const { data: children } = await admin
        .from("projects")
        .select("id")
        .eq("parent_project_id", scope.projectId)
        .eq("user_id", userId);
      for (const child of children ?? []) projectIds.push(child.id);
    } else {
      const { data: domainProjects } = await admin
        .from("projects")
        .select("id")
        .eq("domain_id", scope.domainId)
        .eq("user_id", userId);
      for (const project of domainProjects ?? []) projectIds.push(project.id);
    }

    let query = admin
      .from("tasks")
      .select("id")
      .eq("user_id", userId)
      .or("gcal_event_id.not.is.null,scheduled_time.not.is.null");

    if ("projectId" in scope) {
      query = query.in("project_id", projectIds);
    } else if (projectIds.length > 0) {
      query = query.or(`domain_id.eq.${scope.domainId},project_id.in.(${projectIds.join(",")})`);
    } else {
      query = query.eq("domain_id", scope.domainId);
    }

    const { data } = await query;
    return (data ?? []).map((t) => t.id);
  } catch (err) {
    console.error("Finding calendar-affected tasks failed", scope, err);
    return [];
  }
}

export type GoogleCalendarEvent = {
  id: string;
  title: string;
  /** RFC3339 dateTime for timed events; YYYY-MM-DD for all-day. */
  start: string;
  end: string;
  all_day: boolean;
  account: string | null;
};

/**
 * Events from every connected account in [startDate, endDate] (YYYY-MM-DD,
 * inclusive), for the Life OS calendar view and the Claude-facing
 * list_google_calendar_events tools. Pushed-task events are filtered out
 * (see TASK_ID_PROP). Window is padded a day each side so timezone offsets
 * near midnight can't drop edge events — callers bucket by local date anyway.
 */
export async function listGoogleCalendarEvents(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<GoogleCalendarEvent[] | null> {
  const admin = createAdminClient();
  const { data: connections } = await admin
    .from("google_calendar_connections")
    .select("id, email")
    .eq("user_id", userId);
  if (!connections || connections.length === 0) return null;

  const timeMin = new Date(`${startDate}T00:00:00Z`);
  timeMin.setUTCDate(timeMin.getUTCDate() - 1);
  const timeMax = new Date(`${endDate}T00:00:00Z`);
  timeMax.setUTCDate(timeMax.getUTCDate() + 2);

  const events: GoogleCalendarEvent[] = [];
  for (const connection of connections) {
    try {
      const accessToken = await getValidCalendarAccessToken(admin, connection.id);
      if (!accessToken) continue;

      const url = new URL(`${CALENDAR_API}/calendars/primary/events`);
      url.searchParams.set("timeMin", timeMin.toISOString());
      url.searchParams.set("timeMax", timeMax.toISOString());
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "250");

      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) continue;
      const data = await res.json();

      for (const item of data.items ?? []) {
        if (item.status === "cancelled") continue;
        if (item.extendedProperties?.private?.[TASK_ID_PROP]) continue;
        const start = item.start?.dateTime ?? item.start?.date;
        const end = item.end?.dateTime ?? item.end?.date;
        if (!start || !end) continue;
        events.push({
          id: item.id,
          title: item.summary ?? "(no title)",
          start,
          end,
          all_day: !item.start?.dateTime,
          account: connection.email,
        });
      }
    } catch (err) {
      console.error("Google Calendar read failed for connection", connection.id, err);
    }
  }
  return events;
}
