"use client";

import { useRef, useState } from "react";

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
  } | null>(null);

  function reset() {
    if (stateRef.current) clearTimeout(stateRef.current.timer);
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
    const state = {
      id,
      started: false,
      startX: e.clientX,
      startY: e.clientY,
      timer: setTimeout(() => {
        state.started = true;
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
    // The handle has pointer capture, so hit-test manually for the row
    // (tagged with data-drag-id) currently under the finger.
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const row = under?.closest<HTMLElement>("[data-drag-id]");
    const overId = row?.dataset.dragId;
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
