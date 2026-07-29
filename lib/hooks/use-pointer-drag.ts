"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

export type PointerDragHandleProps = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
};

/**
 * Touch drag-to-reorder (#142, motion audit item 5). HTML5 drag events
 * never fire on touch, so rows' grab handles get pointer events instead:
 * press-and-hold (~250ms) on the handle arms the drag, moving the finger
 * swaps rows (the hook finds the row under the pointer via its
 * data-drag-id attribute), lifting commits. Mouse pointers are ignored —
 * desktop keeps the existing HTML5 drag on the whole row, so the two
 * mechanisms never double-fire.
 *
 * #154: the dragged row now FOLLOWS THE FINGER. While armed, the hook
 * drives an inline translateY on the row (the row stays in flow — its slot
 * is the ghost). Because the row's own layout slot jumps when a swap
 * reorders the list, the translate is offset-compensated: visual delta =
 * (pointer travel) − (how far the row's slot itself moved), read off
 * offsetTop, which ignores transforms. The row also gets
 * pointer-events: none while in hand so elementFromPoint hit-tests the row
 * *under* the finger instead of the one glued to it. On release the row
 * springs back to its slot. All of it no-ops under reduced motion (drag
 * still works, rows just swap in place as before).
 *
 * The handle must have `touch-action: none` (the .drag-handle class) so
 * the browser doesn't claim the gesture for scrolling — on the handle
 * only, never the row, so the list still scrolls normally.
 */
export function usePointerDrag({
  holdMs = 250,
  onOver,
  onDrop,
}: {
  holdMs?: number;
  /** The dragged item is over another item's row — reorder local state. */
  onOver: (draggedId: string, overId: string) => void;
  /** Pointer lifted after a drag actually started — commit the order. */
  onDrop: (draggedId: string) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const stateRef = useRef<{
    id: string;
    timer: ReturnType<typeof setTimeout>;
    started: boolean;
    startX: number;
    startY: number;
    /** The dragged row element, grabbed at pointerdown (handle's closest [data-drag-id]). */
    row: HTMLElement | null;
    /** The row's untransformed offsetTop when the drag armed — swap compensation baseline. */
    baseOffsetTop: number;
  } | null>(null);

  /** Let go of the row: settle it back to its slot on a short spring. */
  function releaseRow(row: HTMLElement | null) {
    if (!row) return;
    row.style.pointerEvents = "";
    if (!row.style.transform) return;
    row.style.transition = "transform 200ms var(--spring-settle)";
    row.style.transform = "";
    const clear = () => {
      row.style.transition = "";
      row.removeEventListener("transitionend", clear);
    };
    row.addEventListener("transitionend", clear);
    // Fallback in case transitionend never fires (row re-rendered mid-settle).
    setTimeout(clear, 300);
  }

  function reset() {
    if (stateRef.current) {
      clearTimeout(stateRef.current.timer);
      releaseRow(stateRef.current.row);
    }
    stateRef.current = null;
    setDraggingId(null);
  }

  function handlePointerDown(id: string, e: React.PointerEvent) {
    // Desktop mice use the row's HTML5 drag; only touch/pen come through here.
    if (e.pointerType === "mouse") return;
    reset();
    // Capture on the handle: every subsequent move/up lands on it even as
    // the finger travels over other rows.
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const row = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-drag-id]");
    const state = {
      id,
      started: false,
      startX: e.clientX,
      startY: e.clientY,
      row,
      baseOffsetTop: 0,
      timer: setTimeout(() => {
        state.started = true;
        if (row && !prefersReducedMotion()) {
          state.baseOffsetTop = row.offsetTop;
          // The row rides with the finger from here — take it out of
          // hit-testing so elementFromPoint sees what's underneath it.
          row.style.pointerEvents = "none";
        }
        setDraggingId(id);
      }, holdMs),
    };
    stateRef.current = state;
  }

  function handlePointerMove(e: React.PointerEvent) {
    const state = stateRef.current;
    if (!state) return;
    if (!state.started) {
      // Wandered off before the long-press armed — treat as an accidental
      // touch, not a drag.
      if (Math.hypot(e.clientX - state.startX, e.clientY - state.startY) > 10) reset();
      return;
    }
    // Follow the finger: pointer travel minus how far the row's own layout
    // slot moved (swaps re-slot it), so the row tracks the touch point.
    const { row } = state;
    if (row && !prefersReducedMotion()) {
      const dy = e.clientY - state.startY - (row.offsetTop - state.baseOffsetTop);
      row.style.transform = `translateY(${dy}px) scale(1.02)`;
    }
    // The handle has pointer capture, so hit-test manually for the row
    // under the finger. data-drag-id marks draggable rows; data-drop-id
    // marks rows that can't be dragged but can be dragged PAST — a
    // recurring group's face row and its "+N more" stub announce the
    // group's first occurrence id, so the swap treats hovering the group
    // like hovering that occurrence (#154 round 2 — without this, a list
    // topped by groups was a wall a drag could never cross).
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const overRow = under?.closest<HTMLElement>("[data-drag-id], [data-drop-id]");
    const overId = overRow?.dataset.dragId ?? overRow?.dataset.dropId;
    if (overId && overId !== state.id) onOver(state.id, overId);
  }

  function handlePointerUp() {
    const state = stateRef.current;
    if (!state) return;
    const { id, started } = state;
    reset();
    if (started) onDrop(id);
  }

  return {
    /** The id mid-touch-drag, for lift styling — null when idle. */
    draggingId,
    /** Spread onto an item's grab handle (which also needs .drag-handle). */
    handleProps: (id: string): PointerDragHandleProps => ({
      onPointerDown: (e) => handlePointerDown(id, e),
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: reset,
    }),
  };
}

/**
 * FLIP slides for reorder swaps (#154): when a touch drag swaps the order
 * array, the rows that got displaced glide to their new slot instead of
 * teleporting. First: the list calls `capture()` just before the swap's
 * setState, recording every flippable row's on-screen top
 * (getBoundingClientRect, so a row caught mid-glide is measured where it
 * visually is). Last + Invert + Play: after React commits the new order,
 * the layout effect measures each row's new top, applies the inverted
 * delta as an inline transform with transitions off, forces a reflow,
 * then transitions to zero on the settle spring. The dragged row is
 * skipped — it's finger-driven. Inline transition styles are cleaned up
 * on transitionend so they can't shadow other transitions (e.g. the
 * leave-collapse) later.
 *
 * Flippable rows are found in the DOM, not from the order array
 * (#154 round 2): anything tagged data-drag-id or data-flip-key.
 * data-flip-key covers rows that move but aren't drag targets —
 * a collapsed recurring group's visible row and its "+N more" stub —
 * which used to teleport while their single-task neighbors glided.
 * Rows from unrelated lists get measured too, but their delta is 0 so
 * they're skipped.
 *
 * Deliberately scoped to touch drags: the HTML5 desktop path never calls
 * `capture`, so desktop behavior is unchanged. No-ops under reduced motion.
 */
function flipTargets(): Map<string, HTMLElement> {
  const targets = new Map<string, HTMLElement>();
  document
    .querySelectorAll<HTMLElement>("[data-drag-id], [data-flip-key]")
    .forEach((el) => {
      const key = el.dataset.flipKey ?? el.dataset.dragId;
      if (key) targets.set(key, el);
    });
  return targets;
}

export function useRowFlip(order: string[], draggingId: string | null) {
  const prevTopsRef = useRef<Map<string, number> | null>(null);

  const capture = useCallback(() => {
    if (prefersReducedMotion()) return;
    const tops = new Map<string, number>();
    for (const [key, el] of flipTargets()) {
      tops.set(key, el.getBoundingClientRect().top);
    }
    prevTopsRef.current = tops;
  }, []);

  useLayoutEffect(() => {
    const prev = prevTopsRef.current;
    if (!prev) return;
    prevTopsRef.current = null;
    const now = flipTargets();
    for (const [id, prevTop] of prev) {
      if (id === draggingId) continue;
      const el = now.get(id);
      if (!el) continue;
      // Measure the row's true new slot with any in-flight glide cleared.
      el.style.transition = "none";
      el.style.transform = "";
      const delta = prevTop - el.getBoundingClientRect().top;
      if (Math.abs(delta) < 0.5) {
        el.style.transition = "";
        continue;
      }
      el.style.transform = `translateY(${delta}px)`;
      void el.offsetHeight; // commit the inverted position before playing
      el.style.transition = "transform 220ms var(--spring-settle)";
      el.style.transform = "";
      const clear = () => {
        el.style.transition = "";
        el.removeEventListener("transitionend", clear);
      };
      el.addEventListener("transitionend", clear);
      setTimeout(clear, 320); // fallback if transitionend is swallowed
    }
  }, [order, draggingId]);

  return { capture };
}
