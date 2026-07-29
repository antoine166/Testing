import { describe, expect, it } from "vitest";
import { selectableProjects } from "./selectable";

const projects = [
  { id: "a", status: "active" },
  { id: "b", status: "completed" },
  { id: "c", status: "on_hold" },
  { id: "d" }, // status not loaded (older callers) — must stay visible
];

describe("selectableProjects", () => {
  it("hides completed projects from new-task pickers", () => {
    expect(selectableProjects(projects).map((p) => p.id)).toEqual(["a", "c", "d"]);
  });

  it("keeps a completed project when it's the task's current one", () => {
    expect(selectableProjects(projects, "b").map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("keepId that isn't completed changes nothing", () => {
    expect(selectableProjects(projects, "a").map((p) => p.id)).toEqual(["a", "c", "d"]);
  });

  it("null/undefined keepId behave like no keepId", () => {
    expect(selectableProjects(projects, null)).toEqual(selectableProjects(projects));
  });
});
