import { describe, expect, it } from "vitest";
import type { Task } from "@/components/task-row";
import {
  applyTaskUpdates,
  mergeServerTask,
  needsFullReload,
  removeSeriesFrom,
  removeTask,
} from "./optimistic";

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    project_id: null,
    domain_id: null,
    title: "t",
    link: null,
    notes: null,
    status: "todo",
    priority: "none",
    due_date: null,
    scheduled_date: null,
    someday: false,
    context: null,
    waiting_for: false,
    waiting_since: null,
    ...overrides,
  } as Task;
}

describe("applyTaskUpdates", () => {
  it("merges updates into only the matching task", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" })];
    const next = applyTaskUpdates(tasks, "a", { status: "done" });
    expect(next[0].status).toBe("done");
    expect(next[1].status).toBe("todo");
  });

  it("leaves untouched fields alone", () => {
    const tasks = [task({ id: "a", title: "keep me", priority: "high" })];
    const next = applyTaskUpdates(tasks, "a", { notes: "hi" });
    expect(next[0].title).toBe("keep me");
    expect(next[0].priority).toBe("high");
    expect(next[0].notes).toBe("hi");
  });
});

describe("mergeServerTask", () => {
  it("lets server-computed fields win, including explicit nulls", () => {
    const tasks = [
      task({ id: "a", waiting_for: true, waiting_since: "2026-07-01", waiting_on: "Sam" }),
    ];
    const server = task({ id: "a", waiting_for: false, waiting_since: null, waiting_on: null });
    const next = mergeServerTask(tasks, server);
    expect(next[0].waiting_since).toBeNull();
    expect(next[0].waiting_on).toBeNull();
  });

  it("preserves joined/list-only fields the bare server row doesn't carry", () => {
    const local = task({ id: "a", attachment_count: 3 });
    local.recurring_task_templates = { recurrence_type: "daily" } as Task["recurring_task_templates"];
    // A bare PUT response row has neither key at all.
    const server = task({ id: "a", title: "renamed" });
    delete (server as Record<string, unknown>).attachment_count;
    delete (server as Record<string, unknown>).recurring_task_templates;
    const next = mergeServerTask([local], server);
    expect(next[0].title).toBe("renamed");
    expect(next[0].attachment_count).toBe(3);
    expect(next[0].recurring_task_templates).toEqual({ recurrence_type: "daily" });
  });

  it("touches only the matching task", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", title: "other" })];
    const next = mergeServerTask(tasks, task({ id: "a", title: "renamed" }));
    expect(next[1].title).toBe("other");
  });
});

describe("removeTask", () => {
  it("removes exactly the matching task", () => {
    const next = removeTask([task({ id: "a" }), task({ id: "b" })], "a");
    expect(next.map((t) => t.id)).toEqual(["b"]);
  });
});

describe("removeSeriesFrom", () => {
  const anchor = task({
    id: "occ2",
    recurring_template_id: "tpl",
    scheduled_date: "2026-07-10",
  });
  const series = [
    task({ id: "occ1", recurring_template_id: "tpl", scheduled_date: "2026-07-03" }),
    anchor,
    task({ id: "occ3", recurring_template_id: "tpl", scheduled_date: "2026-07-17" }),
    task({
      id: "occDone",
      recurring_template_id: "tpl",
      scheduled_date: "2026-07-17",
      status: "done",
    }),
    task({ id: "occNoDate", recurring_template_id: "tpl", scheduled_date: null }),
    task({ id: "otherTpl", recurring_template_id: "tpl2", scheduled_date: "2026-07-17" }),
    task({ id: "plain", scheduled_date: "2026-07-17" }),
  ];

  it("removes the anchor and later not-done occurrences of the same template", () => {
    const next = removeSeriesFrom(series, anchor);
    expect(next.map((t) => t.id)).toEqual(["occ1", "occDone", "occNoDate", "otherTpl", "plain"]);
  });

  it("keeps done occurrences (history) and unscheduled rows, matching SQL gte-on-NULL", () => {
    const next = removeSeriesFrom(series, anchor);
    expect(next.some((t) => t.id === "occDone")).toBe(true);
    expect(next.some((t) => t.id === "occNoDate")).toBe(true);
  });

  it("removes all dated occurrences when the anchor itself has no date", () => {
    const undatedAnchor = task({ id: "occNoDate", recurring_template_id: "tpl", scheduled_date: null });
    const next = removeSeriesFrom(series, undatedAnchor);
    expect(next.map((t) => t.id)).toEqual(["occDone", "occNoDate", "otherTpl", "plain"]);
  });

  it("is a no-op for a task that isn't part of a series", () => {
    expect(removeSeriesFrom(series, task({ id: "plain" }))).toEqual(series);
  });
});

describe("needsFullReload", () => {
  it("requires a reload when completing a recurring occurrence (server may generate the next one)", () => {
    expect(needsFullReload(task({ id: "a", recurring_template_id: "tpl" }), { status: "done" })).toBe(true);
  });

  it("does not reload for completing a plain task", () => {
    expect(needsFullReload(task({ id: "a" }), { status: "done" })).toBe(false);
  });

  it("does not reload for un-completing or ordinary edits", () => {
    expect(needsFullReload(task({ id: "a", recurring_template_id: "tpl" }), { status: "todo" })).toBe(false);
    expect(needsFullReload(task({ id: "a", recurring_template_id: "tpl" }), { title: "x" })).toBe(false);
  });

  it("handles an unknown task defensively", () => {
    expect(needsFullReload(undefined, { status: "done" })).toBe(false);
  });
});
