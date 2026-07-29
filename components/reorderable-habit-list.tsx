"use client";

import { useEffect, useRef, useState } from "react";
import HabitRow, {
  type Habit,
  type HabitDomain,
  type HabitLogRow,
} from "@/components/habit-row";
import { usePointerDrag, useRowFlip } from "@/lib/hooks/use-pointer-drag";

/**
 * One Habits-page section's rows, draggable into any order (#142). Same
 * two drag mechanisms as ReorderableTaskList — HTML5 drag on the row for
 * desktop mice, press-and-hold pointer drag on the grab handle for touch —
 * but commit is the parent's job: habits keep ONE global sort_order, and
 * only the page can see all its sections to assemble the full id list, so
 * a drop just hands the section's new order up via onCommitOrder.
 */
export default function ReorderableHabitList({
  habits,
  logs,
  today,
  domains,
  onCommitOrder,
  ...rowProps
}: {
  /** This section's habits in current display order. */
  habits: Habit[];
  logs: HabitLogRow[];
  today: string;
  domains: HabitDomain[];
  /** Called with the section's habit ids in their new display order after a drop. */
  onCommitOrder: (ids: string[]) => Promise<void> | void;
  onToggle: (habit: Habit, date: string, loggedOnDate: boolean) => void;
  onAddLog: (habit: Habit, date: string) => void;
  onRemoveLog: (habit: Habit, date: string) => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  // Local order (ids) while dragging; resynced whenever the incoming habit
  // set changes (render-adjust, keyed on the joined id list).
  const [order, setOrder] = useState<string[]>(() => habits.map((h) => h.id));
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const incomingKey = habits.map((h) => h.id).join("|");
  const [prevKey, setPrevKey] = useState(incomingKey);
  if (incomingKey !== prevKey) {
    setPrevKey(incomingKey);
    setOrder(habits.map((h) => h.id));
  }

  // Commit reads the ref — the touch drop's closure may predate the last
  // swap. Synced in an effect (not during render), per the react-hooks rules.
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  });

  function moveInOrder(draggedId: string, targetId: string) {
    setOrder((prev) => {
      const from = prev.indexOf(draggedId);
      const to = prev.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function commit() {
    void onCommitOrder(orderRef.current);
  }

  // #154: touch swaps capture row positions first so displaced neighbors
  // FLIP-glide to their new slot; desktop's HTML5 path never captures.
  const pointer = usePointerDrag({ onOver: handlePointerOver, onDrop: commit });
  const flip = useRowFlip(order, pointer.draggingId);
  function handlePointerOver(dragged: string, target: string) {
    flip.capture(orderRef.current);
    moveInOrder(dragged, target);
  }

  const byId = new Map(habits.map((h) => [h.id, h]));
  const ordered = order.map((id) => byId.get(id)).filter((h): h is Habit => !!h);

  return (
    <>
      {ordered.map((habit) => (
        <HabitRow
          key={habit.id}
          habit={habit}
          logs={logs.filter((l) => l.habit_id === habit.id)}
          today={today}
          domains={domains}
          {...rowProps}
          dragProps={{
            onDragStart: () => setDraggedId(habit.id),
            onDragOver: (e) => {
              e.preventDefault();
              if (draggedId && draggedId !== habit.id) moveInOrder(draggedId, habit.id);
            },
            onDragEnd: () => {
              if (!draggedId) return;
              setDraggedId(null);
              commit();
            },
            dragging: draggedId === habit.id || pointer.draggingId === habit.id,
            handleProps: pointer.handleProps(habit.id),
          }}
        />
      ))}
    </>
  );
}
