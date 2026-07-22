"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTaskList } from "@/lib/hooks/use-task-list";
import type { Task, TaskDomain } from "@/components/task-row";
import { todayLocal } from "@/lib/date";

type GCalEvent = {
  id: string;
  title: string;
  start: string; // RFC3339 dateTime for timed, YYYY-MM-DD for all-day
  end: string;
  all_day: boolean;
  account: string | null;
};

// GTD's hard landscape, visualized. Three kinds of entry, kept visually
// distinct on purpose:
//  - timed blocks (scheduled_date + scheduled_time): real appointments /
//    deliberate time blocks — the only things allowed on the time grid
//  - all-day chips (scheduled_date only): "I plan to work on this today,"
//    an intention, shown above the grid so it never masquerades as a
//    commitment
//  - due flags (due_date): hard deadlines, rendered as ⚑ markers — a
//    deadline is a fact about the world, not a plan for your time
const HOUR_PX = 48; // 1 hour of grid height
const DAY_START_SCROLL_HOUR = 7;
const DEFAULT_BLOCK_MINUTES = 60;
const SNAP_MINUTES = 15;

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** The Sunday on or before dateStr — same 0=Sun convention as habits. */
function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return addDays(dateStr, -new Date(y, m - 1, d).getDay());
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - SNAP_MINUTES, minutes));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

function formatTimeLabel(time: string): string {
  const minutes = timeToMinutes(time);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, "0")}${suffix}`;
}

function dayLabel(dateStr: string): { weekday: string; day: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
    day: date.getDate(),
  };
}

function monthLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function domainColor(task: Task, domains: TaskDomain[]): string | null {
  if (!task.domain_id) return null;
  return domains.find((d) => d.id === task.domain_id)?.color ?? null;
}

export default function CalendarPage() {
  const { domains, tasks, loading, error, handleUpdate, toggleDone } = useTaskList();
  const today = todayLocal();

  const [view, setView] = useState<"week" | "day">("week");
  const [anchor, setAnchor] = useState(today); // day view: the day; week view: any day in the week
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trayFilter, setTrayFilter] = useState("");
  const [gcalEvents, setGcalEvents] = useState<GCalEvent[]>([]);
  const [gcalConnected, setGcalConnected] = useState<boolean | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const scrolledOnce = useRef(false);

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    const start = weekStartOf(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [view, anchor]);

  // Google events for the visible range — fetched live, never stored.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/google-calendar/events?start=${days[0]}&end=${days[days.length - 1]}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((data: { connected: boolean; events: GCalEvent[] }) => {
        setGcalConnected(data.connected);
        setGcalEvents(data.events);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Google being unreachable shouldn't degrade the task calendar —
        // just show it without events.
      });
    return () => controller.abort();
  }, [days]);

  // Bucket events by local calendar date. Timed events land on their local
  // start date; all-day events span [start, end) per Google's exclusive-end
  // convention (capped defensively — a malformed range shouldn't hang render).
  const { timedEventsByDay, allDayEventsByDay } = useMemo(() => {
    const timed = new Map<string, GCalEvent[]>();
    const allDay = new Map<string, GCalEvent[]>();
    for (const event of gcalEvents) {
      if (event.all_day) {
        let cursor = event.start;
        for (let i = 0; cursor < event.end && i < 60; i++) {
          const list = allDay.get(cursor) ?? [];
          list.push(event);
          allDay.set(cursor, list);
          cursor = addDays(cursor, 1);
        }
      } else {
        const start = new Date(event.start);
        const dateStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
        const list = timed.get(dateStr) ?? [];
        list.push(event);
        timed.set(dateStr, list);
      }
    }
    return { timedEventsByDay: timed, allDayEventsByDay: allDay };
  }, [gcalEvents]);

  function eventBlockStyle(event: GCalEvent): React.CSSProperties {
    const start = new Date(event.start);
    const end = new Date(event.end);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const durationMinutes = Math.max((end.getTime() - start.getTime()) / 60000, 20);
    return {
      top: (startMinutes / 60) * HOUR_PX,
      height: (durationMinutes / 60) * HOUR_PX,
    };
  }

  // Scroll the grid to morning once tasks are in — during render would be
  // too early (the ref isn't attached while loading), and an effect would
  // trip the set-state-in-effect lint; a callback ref cleanly runs on attach.
  function attachGrid(node: HTMLDivElement | null) {
    gridRef.current = node;
    if (node && !scrolledOnce.current) {
      scrolledOnce.current = true;
      node.scrollTop = DAY_START_SCROLL_HOUR * HOUR_PX;
    }
  }

  const active = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);

  const timedByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of active) {
      if (t.scheduled_date && t.scheduled_time) {
        const list = map.get(t.scheduled_date) ?? [];
        list.push(t);
        map.set(t.scheduled_date, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => timeToMinutes(a.scheduled_time!) - timeToMinutes(b.scheduled_time!));
    }
    return map;
  }, [active]);

  const allDayByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of active) {
      if (t.scheduled_date && !t.scheduled_time) {
        const list = map.get(t.scheduled_date) ?? [];
        list.push(t);
        map.set(t.scheduled_date, list);
      }
    }
    return map;
  }, [active]);

  // Deadline flags: due that day and not already visible there as a
  // scheduled entry — a task scheduled the day it's due shows once, with
  // its own deadline styling, instead of twice.
  const dueByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of active) {
      if (t.due_date && t.scheduled_date !== t.due_date) {
        const list = map.get(t.due_date) ?? [];
        list.push(t);
        map.set(t.due_date, list);
      }
    }
    return map;
  }, [active]);

  const unscheduled = useMemo(() => {
    const filter = trayFilter.trim().toLowerCase();
    return active
      .filter((t) => !t.scheduled_date && !t.someday && !t.waiting_for)
      .filter((t) => !filter || t.title.toLowerCase().includes(filter))
      .sort((a, b) => {
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
        if (a.due_date !== b.due_date) return a.due_date ? -1 : 1;
        const rank = { high: 0, medium: 1, low: 2, none: 3 } as const;
        return rank[a.priority] - rank[b.priority];
      })
      .slice(0, 40);
  }, [active, trayFilter]);

  const selected = selectedId ? tasks.find((t) => t.id === selectedId) : null;

  async function scheduleAt(taskId: string, date: string, time: string | null) {
    setPlacingId(null);
    setSelectedId(null);
    await handleUpdate(taskId, { scheduled_date: date, scheduled_time: time });
  }

  function minutesFromPointer(e: React.MouseEvent | React.DragEvent, column: HTMLElement): number {
    const rect = column.getBoundingClientRect();
    const raw = ((e.clientY - rect.top) / HOUR_PX) * 60;
    return Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
  }

  function handleColumnDrop(e: React.DragEvent<HTMLDivElement>, date: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    void scheduleAt(id, date, minutesToTime(minutesFromPointer(e, e.currentTarget)));
  }

  function handleColumnClick(e: React.MouseEvent<HTMLDivElement>, date: string) {
    if (!placingId) return;
    void scheduleAt(placingId, date, minutesToTime(minutesFromPointer(e, e.currentTarget)));
  }

  function blockStyle(task: Task): React.CSSProperties {
    const start = timeToMinutes(task.scheduled_time!);
    const minutes = task.estimated_minutes ?? DEFAULT_BLOCK_MINUTES;
    const color = domainColor(task, domains);
    return {
      top: (start / 60) * HOUR_PX,
      height: Math.max((Math.max(minutes, 20) / 60) * HOUR_PX, 20),
      borderLeftColor: color ?? "#6366f1",
    };
  }

  const step = view === "day" ? 1 : 7;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-lg font-semibold">{monthLabel(days[0])}</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAnchor(addDays(anchor, -step))}
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            aria-label="Previous"
          >
            ←
          </button>
          <button
            onClick={() => setAnchor(today)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Today
          </button>
          <button
            onClick={() => setAnchor(addDays(anchor, step))}
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            aria-label="Next"
          >
            →
          </button>
        </div>
        <div className="flex items-center gap-1">
          {(["week", "day"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-2 py-1 text-sm capitalize ${
                view === v
                  ? "bg-zinc-200 font-medium dark:bg-zinc-700"
                  : "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        {placingId && (
          <span className="ml-auto flex items-center gap-2 rounded-md bg-indigo-100 px-2 py-1 text-xs text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
            Tap a time slot (or a day&apos;s all-day row) to place it
            <button onClick={() => setPlacingId(null)} className="font-semibold underline">
              Cancel
            </button>
          </span>
        )}
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Loading…</p>}
      {gcalConnected === false && (
        <p className="mb-2 text-xs text-zinc-400">
          Tip: connect Google Calendar in{" "}
          <a href="/settings" className="underline">
            Settings
          </a>{" "}
          to see your real events here and push time blocks to your calendar.
        </p>
      )}

      {selected && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <span className="font-medium">{selected.title}</span>
          {selected.scheduled_time && (
            <span className="text-xs text-zinc-500">
              {formatTimeLabel(selected.scheduled_time)}
              {" · "}
              {selected.estimated_minutes ?? DEFAULT_BLOCK_MINUTES} min
            </span>
          )}
          {selected.due_date && (
            <span className="text-xs text-red-600 dark:text-red-400">⚑ due {selected.due_date}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                void toggleDone(selected);
                setSelectedId(null);
              }}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              ✓ Done
            </button>
            {selected.scheduled_time ? (
              <button
                onClick={() => {
                  void handleUpdate(selected.id, { scheduled_time: null });
                  setSelectedId(null);
                }}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Remove time
              </button>
            ) : null}
            {selected.scheduled_date ? (
              <button
                onClick={() => {
                  void handleUpdate(selected.id, { scheduled_date: null, scheduled_time: null });
                  setSelectedId(null);
                }}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Unschedule
              </button>
            ) : (
              <button
                onClick={() => {
                  setPlacingId(selected.id);
                  setSelectedId(null);
                }}
                className="rounded-md border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950"
              >
                Place on calendar
              </button>
            )}
            <button
              onClick={() => setSelectedId(null)}
              className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col overflow-x-auto">
          <div
            className="grid"
            style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(${view === "day" ? "12rem" : "8.5rem"}, 1fr))` }}
          >
            <div />
            {days.map((date) => {
              const { weekday, day } = dayLabel(date);
              return (
                <div
                  key={date}
                  className={`border-b border-l border-zinc-200 px-1.5 py-1 text-xs dark:border-zinc-800 ${
                    date === today ? "font-semibold text-indigo-600 dark:text-indigo-400" : "text-zinc-500"
                  }`}
                >
                  {weekday} {day}
                </div>
              );
            })}

            {/* All-day strip: intentions (chips) + deadlines (flags) */}
            <div className="border-b border-zinc-200 py-1 pr-1 text-right text-[10px] text-zinc-400 dark:border-zinc-800">
              all-day
            </div>
            {days.map((date) => (
              <div
                key={date}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) void scheduleAt(id, date, null);
                }}
                onClick={() => {
                  if (placingId) void scheduleAt(placingId, date, null);
                }}
                className={`min-h-8 space-y-0.5 border-b border-l border-zinc-200 p-0.5 dark:border-zinc-800 ${
                  placingId ? "cursor-pointer bg-indigo-50/50 dark:bg-indigo-950/30" : ""
                }`}
              >
                {(allDayEventsByDay.get(date) ?? []).map((event) => (
                  <div
                    key={`gcal-${event.id}-${date}`}
                    className="block w-full truncate rounded bg-zinc-200/80 px-1 text-left text-[11px] text-zinc-600 italic dark:bg-zinc-700/50 dark:text-zinc-300"
                    title={`${event.title}${event.account ? ` — ${event.account}` : ""} (Google Calendar)`}
                  >
                    {event.title}
                  </div>
                ))}
                {(dueByDay.get(date) ?? []).map((t) => (
                  <button
                    key={`due-${t.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(t.id);
                    }}
                    className="block w-full truncate rounded border border-red-300 bg-red-50 px-1 text-left text-[11px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                    title={`Due ${t.due_date}: ${t.title}`}
                  >
                    ⚑ {t.title}
                  </button>
                ))}
                {(allDayByDay.get(date) ?? []).map((t) => (
                  <button
                    key={t.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(t.id);
                    }}
                    style={{ borderLeftColor: domainColor(t, domains) ?? "#a1a1aa" }}
                    className={`block w-full cursor-grab truncate rounded border-l-2 bg-zinc-100 px-1 text-left text-[11px] dark:bg-zinc-800 ${
                      t.due_date === date ? "font-medium text-red-700 dark:text-red-300" : ""
                    }`}
                    title={t.title}
                  >
                    {t.due_date === date ? "⚑ " : ""}
                    {t.recurring_template_id ? "↻ " : ""}
                    {t.title}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div ref={attachGrid} className="min-h-0 flex-1 overflow-y-auto">
            <div
              className="grid"
              style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(${view === "day" ? "12rem" : "8.5rem"}, 1fr))` }}
            >
              <div className="relative" style={{ height: 24 * HOUR_PX }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    className="absolute right-1 -translate-y-1/2 text-[10px] text-zinc-400"
                    style={{ top: h * HOUR_PX }}
                  >
                    {h > 0 ? formatHour(h) : ""}
                  </div>
                ))}
              </div>
              {days.map((date) => (
                <div
                  key={date}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleColumnDrop(e, date)}
                  onClick={(e) => handleColumnClick(e, date)}
                  className={`relative border-l border-zinc-200 dark:border-zinc-800 ${
                    date === today ? "bg-indigo-50/40 dark:bg-indigo-950/20" : ""
                  } ${placingId ? "cursor-pointer" : ""}`}
                  style={{ height: 24 * HOUR_PX }}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <div
                      key={h}
                      className="absolute right-0 left-0 border-t border-zinc-100 dark:border-zinc-800/60"
                      style={{ top: h * HOUR_PX }}
                    />
                  ))}
                  {(timedEventsByDay.get(date) ?? []).map((event) => (
                    <div
                      key={`gcal-${event.id}`}
                      style={{ ...eventBlockStyle(event), left: 2, right: 2 }}
                      className="absolute overflow-hidden rounded bg-zinc-200/80 px-1 py-0.5 text-[11px] text-zinc-600 italic dark:bg-zinc-700/50 dark:text-zinc-300"
                      title={`${event.title}${event.account ? ` — ${event.account}` : ""} (Google Calendar)`}
                    >
                      {event.title}
                    </div>
                  ))}
                  {(timedByDay.get(date) ?? []).map((t, i) => (
                    <button
                      key={t.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(t.id);
                      }}
                      style={{ ...blockStyle(t), left: i % 2 === 0 ? 2 : 10, right: 2 }}
                      className={`absolute cursor-grab overflow-hidden rounded border-l-2 bg-white px-1 py-0.5 text-left text-[11px] shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700 ${
                        t.due_date === date ? "ring-red-300 dark:ring-red-800" : ""
                      }`}
                      title={`${formatTimeLabel(t.scheduled_time!)} ${t.title}`}
                    >
                      <span className="mr-1 text-zinc-500">{formatTimeLabel(t.scheduled_time!)}</span>
                      {t.due_date === date ? "⚑ " : ""}
                      {t.recurring_template_id ? "↻ " : ""}
                      {t.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Time-blocking tray: drag onto the grid (desktop) or tap → place (mobile) */}
        <details className="w-56 shrink-0 max-lg:hidden" open>
          <summary className="mb-2 cursor-pointer text-sm font-semibold">To schedule</summary>
          <input
            value={trayFilter}
            onChange={(e) => setTrayFilter(e.target.value)}
            placeholder="Filter…"
            className="mb-2 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {unscheduled.map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                onClick={() => setPlacingId(placingId === t.id ? null : t.id)}
                style={{ borderLeftColor: domainColor(t, domains) ?? "#a1a1aa" }}
                className={`cursor-grab rounded border-l-2 bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800 ${
                  placingId === t.id ? "ring-2 ring-indigo-400" : ""
                }`}
              >
                <span className="block truncate">{t.title}</span>
                {t.due_date && <span className="text-[10px] text-red-600 dark:text-red-400">⚑ {t.due_date}</span>}
              </div>
            ))}
            {unscheduled.length === 0 && (
              <p className="text-xs text-zinc-400">Nothing unscheduled matches.</p>
            )}
          </div>
        </details>
      </div>

      {/* Mobile tray */}
      <details className="mt-3 lg:hidden">
        <summary className="cursor-pointer text-sm font-semibold">To schedule ({unscheduled.length})</summary>
        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {unscheduled.map((t) => (
            <button
              key={t.id}
              onClick={() => setPlacingId(placingId === t.id ? null : t.id)}
              style={{ borderLeftColor: domainColor(t, domains) ?? "#a1a1aa" }}
              className={`block w-full rounded border-l-2 bg-zinc-100 px-2 py-1.5 text-left text-sm dark:bg-zinc-800 ${
                placingId === t.id ? "ring-2 ring-indigo-400" : ""
              }`}
            >
              <span className="block truncate">{t.title}</span>
              {t.due_date && <span className="text-[10px] text-red-600 dark:text-red-400">⚑ {t.due_date}</span>}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
