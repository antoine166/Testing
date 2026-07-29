import { describe, expect, it } from "vitest";
import { applyListOrder } from "./list-order";

type Item = { id: string };

const items = (...ids: string[]): Item[] => ids.map((id) => ({ id }));
const idsOf = (list: Item[]) => list.map((i) => i.id);

describe("applyListOrder", () => {
  it("returns items unchanged when no positions exist", () => {
    const input = items("a", "b", "c");
    expect(applyListOrder(input, new Map())).toEqual(input);
  });

  it("orders positioned items by their position", () => {
    const input = items("a", "b", "c");
    const positions = new Map([
      ["a", 2],
      ["b", 0],
      ["c", 1],
    ]);
    expect(idsOf(applyListOrder(input, positions))).toEqual(["b", "c", "a"]);
  });

  it("puts unordered items on top, before every positioned item", () => {
    // "new" arrived after the list was hand-ordered — it should surface at
    // the top, not sink below the arranged rows.
    const input = items("new", "a", "b");
    const positions = new Map([
      ["a", 1],
      ["b", 0],
    ]);
    expect(idsOf(applyListOrder(input, positions))).toEqual(["new", "b", "a"]);
  });

  it("keeps unordered items stable in arrival order (newest-first as given)", () => {
    const input = items("n2", "a", "n1", "b", "n0");
    const positions = new Map([
      ["a", 0],
      ["b", 1],
    ]);
    expect(idsOf(applyListOrder(input, positions))).toEqual(["n2", "n1", "n0", "a", "b"]);
  });

  it("breaks position ties by the incoming order (stable within the ordered half)", () => {
    const input = items("x", "y", "z");
    const positions = new Map([
      ["x", 5],
      ["y", 5],
      ["z", 0],
    ]);
    expect(idsOf(applyListOrder(input, positions))).toEqual(["z", "x", "y"]);
  });

  it("ignores positions for ids not present in the list", () => {
    const input = items("a", "b");
    const positions = new Map([
      ["ghost", 0],
      ["b", 1],
      ["a", 2],
    ]);
    expect(idsOf(applyListOrder(input, positions))).toEqual(["b", "a"]);
  });

  it("does not mutate the input array", () => {
    const input = items("a", "b", "c");
    const copy = [...input];
    applyListOrder(input, new Map([["a", 9]]));
    expect(input).toEqual(copy);
  });

  it("handles an empty list", () => {
    expect(applyListOrder([], new Map([["a", 0]]))).toEqual([]);
  });
});
