"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

/**
 * Shared load-on-mount + reload wiring for page data (July 2026 de-dup,
 * issue #112 item 3). Before this, every page declared a `loadAll()` for
 * post-mutation/realtime reloads AND re-implemented the same fetches in
 * promise-chain form inside its mount effect — two copies of every load.
 *
 * The page supplies one `load` function that fetches and sets its own
 * state (throw on failure — the message becomes the page error); this
 * hook runs it on mount (abortable, so an unmounted page never sets
 * state), exposes `reload` for after mutations, wires the realtime
 * subscription, and owns the loading/error state.
 *
 * Not for lazily-loaded component data (task-row attachments, card
 * items): those load on expand, not on mount, and have no page-level
 * loading/error surface.
 */
export function usePageData(
  load: (signal?: AbortSignal) => Promise<void>,
  options?: { tables?: string[] },
) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The page's `load` closes over fresh state each render; the ref lets
  // the stable `reload` always call the latest one (same pattern as
  // use-realtime-refresh's onChange).
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      await loadRef.current(signal);
      setError(null);
    } catch (err) {
      // Unmount mid-load aborts the fetches — not an error, and setting
      // state after unmount is exactly what the abort exists to prevent.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // reload is async — every setState inside it runs after an await (or in
    // finally, after the try's awaits), never synchronously in this effect
    // body. The rule's static analysis just can't see through the
    // useCallback indirection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  useRealtimeRefresh(options?.tables ?? [], () => reload());

  return { loading, error, setError, reload };
}
