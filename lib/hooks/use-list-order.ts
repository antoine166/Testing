"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Fetches one list's saved per-page positions (#142) as an id → position
 * map for applyListOrder(). Pages compose:
 *
 *   const { positions, refresh } = useListOrder(`project:${id}`);
 *   <ReorderableTaskList tasks={applyListOrder(tasks, positions)}
 *     listKey={`project:${id}`} onReordered={refresh} ... />
 *
 * Pass undefined to no-op (e.g. the Tasks page when no project filter is
 * active — hooks can't be conditional, keys can be).
 */
export function useListOrder(listKey: string | undefined) {
  const [positions, setPositions] = useState<Map<string, number>>(() => new Map());

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!listKey) return;
      try {
        const res = await fetch(`/api/list-orders?list_key=${encodeURIComponent(listKey)}`, {
          signal,
        });
        if (!res.ok) return; // ordering is a nicety — fall back to default order
        const rows: { item_id: string; item_type: string; position: number }[] = await res.json();
        setPositions(
          new Map(rows.filter((r) => r.item_type === "task").map((r) => [r.item_id, r.position])),
        );
      } catch {
        // Offline/aborted: keep whatever we had; the list still renders.
      }
    },
    [listKey],
  );

  useEffect(() => {
    const controller = new AbortController();
    // refresh is async — its setState always runs after an await, never
    // synchronously in this effect body; the rule's static analysis can't
    // see through the useCallback indirection (same as use-page-data).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return { positions, refresh };
}
