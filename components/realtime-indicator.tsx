"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Subtle confirmation that the cross-tab realtime sync is actually working:
 * a brief "Synced" pulse whenever any useRealtimeRefresh hook on the page
 * reacts to a change from another tab/device, rather than that plumbing
 * being entirely invisible.
 */
export default function RealtimeIndicator() {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleSync() {
      setVisible(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setVisible(false), 2000);
    }

    window.addEventListener("life-os:realtime-sync", handleSync);
    return () => {
      window.removeEventListener("life-os:realtime-sync", handleSync);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm transition-opacity duration-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Synced
    </div>
  );
}
