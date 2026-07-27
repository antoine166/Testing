import { describe, expect, it } from "vitest";
import { isInInbox, isRevisitDue, type InboxCandidate } from "./inbox";

const TODAY = "2026-07-26";

function task(overrides: Partial<InboxCandidate> = {}): InboxCandidate {
  return {
    domain_id: null,
    someday: false,
    waiting_for: false,
    status: "todo",
    revisit_date: null,
    ...overrides,
  };
}

describe("isInInbox — the basics", () => {
  it("an unfiled, open task is in the Inbox", () => {
    expect(isInInbox(task(), TODAY)).toBe(true);
  });

  it("filing it under a domain takes it out", () => {
    expect(isInInbox(task({ domain_id: "d1" }), TODAY)).toBe(false);
  });

  it("completing it takes it out", () => {
    expect(isInInbox(task({ status: "done" }), TODAY)).toBe(false);
  });

  it("delegating it takes it out — Waiting For is its own list", () => {
    expect(isInInbox(task({ waiting_for: true }), TODAY)).toBe(false);
  });

  it("in-progress still counts as awaiting a decision", () => {
    expect(isInInbox(task({ status: "in_progress" }), TODAY)).toBe(true);
  });
});

describe("isInInbox — Someday items", () => {
  // The reported bug: Someday items were showing in the Inbox (the Tasks
  // page's Inbox section omitted this exclusion).
  it("a Someday item with no revisit date stays out of the Inbox", () => {
    expect(isInInbox(task({ someday: true }), TODAY)).toBe(false);
  });

  it("a Someday item whose revisit date is still in the future stays out", () => {
    expect(isInInbox(task({ someday: true, revisit_date: "2026-08-01" }), TODAY)).toBe(false);
  });

  it("comes back on the revisit date itself", () => {
    expect(isInInbox(task({ someday: true, revisit_date: TODAY }), TODAY)).toBe(true);
  });

  it("comes back if the revisit date has already passed", () => {
    expect(isInInbox(task({ someday: true, revisit_date: "2026-07-01" }), TODAY)).toBe(true);
  });

  it("a due Someday item already filed under a domain doesn't land in the Inbox", () => {
    // It's been processed — revisiting it is the Someday page's job, not a
    // re-run through the Inbox.
    expect(
      isInInbox(task({ someday: true, revisit_date: "2026-07-01", domain_id: "d1" }), TODAY),
    ).toBe(false);
  });

  it("a due Someday item that's done or delegated stays out", () => {
    expect(
      isInInbox(task({ someday: true, revisit_date: "2026-07-01", status: "done" }), TODAY),
    ).toBe(false);
    expect(
      isInInbox(task({ someday: true, revisit_date: "2026-07-01", waiting_for: true }), TODAY),
    ).toBe(false);
  });
});

describe("isRevisitDue", () => {
  it("only applies to Someday items", () => {
    expect(isRevisitDue({ someday: false, revisit_date: "2026-07-01" }, TODAY)).toBe(false);
    expect(isRevisitDue({ someday: true, revisit_date: "2026-07-01" }, TODAY)).toBe(true);
  });

  it("needs a date to be set at all", () => {
    expect(isRevisitDue({ someday: true, revisit_date: null }, TODAY)).toBe(false);
  });

  it("is inclusive of today and excludes the future", () => {
    expect(isRevisitDue({ someday: true, revisit_date: TODAY }, TODAY)).toBe(true);
    expect(isRevisitDue({ someday: true, revisit_date: "2026-07-27" }, TODAY)).toBe(false);
  });
});
