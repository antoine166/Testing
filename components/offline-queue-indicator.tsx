"use client";

import { useEffect, useState } from "react";
import { flushQueue, onQueueChanged, queueLength } from "@/lib/offline-queue";

/**
 * Persistent (not a transient toast) badge showing how many Quick Captures
 * are waiting to sync — pending items can sit here across page loads until
 * connectivity returns, so this reflects real queue state, not a one-off
 * confirmation. Also drives the actual sync: attempts a flush on mount and
 * whenever the browser reports it's back online.
 */
export default function OfflineQueueIndicator() {
  const [pending, setPending] = useState(0);
  const [failedThisSession, setFailedThisSession] = useState(0);

  useEffect(() => {
    async function refresh() {
      setPending(await queueLength());
    }

    async function trySync() {
      const { failed } = await flushQueue();
      if (failed > 0) setFailedThisSession((n) => n + failed);
      await refresh();
    }

    refresh();
    trySync();

    const unsubscribe = onQueueChanged(refresh);
    window.addEventListener("online", trySync);
    return () => {
      unsubscribe();
      window.removeEventListener("online", trySync);
    };
  }, []);

  if (pending === 0 && failedThisSession === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-50 flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 shadow-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
      {pending > 0 && `${pending} pending sync`}
      {pending > 0 && failedThisSession > 0 && " · "}
      {failedThisSession > 0 && `${failedThisSession} failed`}
    </div>
  );
}
