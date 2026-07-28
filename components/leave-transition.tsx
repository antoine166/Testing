"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Leave transitions for list rows (#121 + #138): when a task disappears
 * from a list (trashed, completed, un-completed, converted), the row
 * collapses smoothly — and shows *why* it left (🗑️ for trash, ↩️ for
 * un-complete) — instead of the rows below jumping up in one frame.
 *
 * Mechanism: mutations register the removal reason by id (markRemovalKind)
 * just before the row leaves state; useLeaveTransition watches a list,
 * notices departed ids that have a registered reason, and keeps a snapshot
 * row mounted (flagged `leaving`) for the animation window. Departures
 * with no registered reason (filter changes, cross-tab realtime reloads)
 * get no animation — only deliberate local actions do.
 */
export type RemovalKind = "trash" | "done" | "undone" | "convert" | "restore";

const recentRemovals = new Map<string, RemovalKind>();

export function markRemovalKind(id: string, kind: RemovalKind) {
  recentRemovals.set(id, kind);
  // Self-clean if no list consumes it (removal happened on a page that
  // doesn't render leave transitions).
  setTimeout(() => recentRemovals.delete(id), 2000);
}

export const LEAVE_MS = 260;

export type LeavingEntry<T> = { item: T; kind: RemovalKind; index: number };

export function useLeaveTransition<T extends { id: string }>(items: T[]): LeavingEntry<T>[] {
  const prevRef = useRef<T[]>([]);
  const [leaving, setLeaving] = useState<Map<string, LeavingEntry<T>>>(new Map());

  useEffect(() => {
    const currentIds = new Set(items.map((i) => i.id));
    const departed: LeavingEntry<T>[] = [];
    prevRef.current.forEach((item, index) => {
      if (currentIds.has(item.id)) return;
      const kind = recentRemovals.get(item.id);
      if (kind) departed.push({ item, kind, index });
    });
    prevRef.current = items;
    if (departed.length === 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    // Synchronous by design: the leaving snapshot must be committed in the
    // very next render after the departure, or the list visibly snaps shut
    // for a frame before re-opening to animate. One bounded cascade, no loop
    // (leaving ids are never in `items`, so re-runs find no new departures).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeaving((prev) => {
      const next = new Map(prev);
      for (const d of departed) next.set(d.item.id, d);
      return next;
    });
    const ids = departed.map((d) => d.item.id);
    // Deliberately no cleanup: each timer only deletes its own ids, and
    // cancelling on the next effect run would strand rows in leaving state.
    setTimeout(() => {
      setLeaving((prev) => {
        const next = new Map(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }, LEAVE_MS + 40);
  }, [items]);

  return [...leaving.values()];
}
