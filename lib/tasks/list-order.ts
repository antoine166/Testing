/**
 * Per-page manual ordering (#142), the client rule: safety sorts group,
 * drag orders within the group; items the user never dragged stay on top
 * in the order they arrived (the API sends newest first), and hand-placed
 * items follow, sorted by their saved position.
 *
 * Pure so it's unit-testable and shareable between the app's pages and the
 * MCP connector's list_tasks.
 */
export function applyListOrder<T extends { id: string }>(
  items: T[],
  positions: Map<string, number>,
): T[] {
  const unordered: T[] = [];
  const ordered: T[] = [];
  for (const item of items) {
    (positions.has(item.id) ? ordered : unordered).push(item);
  }
  // Sort a copy of indices, not the items in place — and break position
  // ties by incoming order so the sort is fully stable.
  const incomingIndex = new Map(items.map((item, i) => [item.id, i]));
  ordered.sort((a, b) => {
    const pa = positions.get(a.id) as number;
    const pb = positions.get(b.id) as number;
    if (pa !== pb) return pa - pb;
    return (incomingIndex.get(a.id) as number) - (incomingIndex.get(b.id) as number);
  });
  return [...unordered, ...ordered];
}
