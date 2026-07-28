import { describe, expect, it } from "vitest";
import { addDays, clientDateOr, monthLabel } from "./date";

describe("clientDateOr", () => {
  // The repro for the UTC-"today" bug (#112 item 4): at 10pm July 27 in
  // New York it is already July 28 in UTC. A server route that stamps
  // new Date().toISOString().slice(0, 10) writes tomorrow's date on
  // check-ins and waiting_since. The fix: the client sends its local
  // date, and the server prefers it over its own (UTC) clock.
  it("prefers a valid client-supplied local date over the server's UTC fallback", () => {
    expect(clientDateOr("2026-07-27", "2026-07-28")).toBe("2026-07-27");
  });

  it("falls back when the client sent nothing", () => {
    expect(clientDateOr(undefined, "2026-07-28")).toBe("2026-07-28");
    expect(clientDateOr(null, "2026-07-28")).toBe("2026-07-28");
    expect(clientDateOr("", "2026-07-28")).toBe("2026-07-28");
  });

  it("falls back on malformed strings rather than storing garbage", () => {
    expect(clientDateOr("garbage", "2026-07-28")).toBe("2026-07-28");
    expect(clientDateOr("2026-7-27", "2026-07-28")).toBe("2026-07-28");
    expect(clientDateOr("2026-07-27T02:00:00Z", "2026-07-28")).toBe("2026-07-28");
    expect(clientDateOr("27-07-2026", "2026-07-28")).toBe("2026-07-28");
  });

  it("falls back on well-formed but impossible dates", () => {
    expect(clientDateOr("2026-13-01", "2026-07-28")).toBe("2026-07-28");
    expect(clientDateOr("2026-02-30", "2026-07-28")).toBe("2026-07-28");
    expect(clientDateOr("2026-00-10", "2026-07-28")).toBe("2026-07-28");
  });

  it("falls back on non-strings", () => {
    expect(clientDateOr(20260727, "2026-07-28")).toBe("2026-07-28");
    expect(clientDateOr({ date: "2026-07-27" }, "2026-07-28")).toBe("2026-07-28");
    expect(clientDateOr(true, "2026-07-28")).toBe("2026-07-28");
  });

  it("accepts leap-day when it exists", () => {
    expect(clientDateOr("2028-02-29", "2026-07-28")).toBe("2028-02-29");
    expect(clientDateOr("2026-02-29", "2026-07-28")).toBe("2026-07-28");
  });
});

describe("addDays (string form)", () => {
  it("adds within a month", () => {
    expect(addDays("2026-07-10", 5)).toBe("2026-07-15");
  });

  it("rolls over month and year boundaries", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("subtracts with negative n", () => {
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles leap-year February", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("monthLabel", () => {
  it("labels a plain date", () => {
    expect(monthLabel("2026-07-15")).toBe("July 2026");
  });

  it("tolerates a timestamp (Logbook groups by completed_at)", () => {
    expect(monthLabel("2026-07-15T22:31:07.000Z")).toBe("July 2026");
  });
});
