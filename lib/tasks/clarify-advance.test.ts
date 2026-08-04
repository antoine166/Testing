import { describe, expect, it } from "vitest";
import { shouldAutoAdvance } from "./clarify-advance";

describe("shouldAutoAdvance", () => {
  it("advances past an item processed elsewhere (another tab, MCP)", () => {
    expect(
      shouldAutoAdvance({
        hasCurrentEntry: true,
        taskInList: false,
        actionInFlight: false,
        awaitingNextAction: false,
      }),
    ).toBe(true);
  });

  it("stays put while the task is still in the list", () => {
    expect(
      shouldAutoAdvance({
        hasCurrentEntry: true,
        taskInList: true,
        actionInFlight: false,
        awaitingNextAction: false,
      }),
    ).toBe(false);
  });

  // Repro for the convert-to-project hijack: the conversion removes the
  // task optimistically while the click handler is still awaiting the
  // server. Auto-advancing here mounted the NEXT inbox item under the
  // "Project created — what's the next action?" panel, as if that item
  // belonged to the new project.
  it("stays put when the flow's own in-flight action removed the task", () => {
    expect(
      shouldAutoAdvance({
        hasCurrentEntry: true,
        taskInList: false,
        actionInFlight: true,
        awaitingNextAction: false,
      }),
    ).toBe(false);
  });

  // After the convert succeeds the source task is gone by design; the
  // "project" panel must survive to capture the project's next action.
  it("stays put on the post-convert next-action panel", () => {
    expect(
      shouldAutoAdvance({
        hasCurrentEntry: true,
        taskInList: false,
        actionInFlight: false,
        awaitingNextAction: true,
      }),
    ).toBe(false);
  });

  // Same root cause as the convert hijack, different symptom: Trash /
  // Reference / "Did it" also remove the task mid-action, and the stray
  // auto-advance stacked with the action's own advance() to skip an item.
  it("stays put during the card's leave animation", () => {
    expect(
      shouldAutoAdvance({
        hasCurrentEntry: true,
        taskInList: false,
        actionInFlight: true,
        awaitingNextAction: false,
      }),
    ).toBe(false);
  });

  it("does nothing once the queue is exhausted", () => {
    expect(
      shouldAutoAdvance({
        hasCurrentEntry: false,
        taskInList: false,
        actionInFlight: false,
        awaitingNextAction: false,
      }),
    ).toBe(false);
  });
});
