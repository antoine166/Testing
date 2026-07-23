"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LOCATIONS } from "@/lib/tasks/context-options";

/**
 * The user's Location list (the editable `contexts` table, GET /api/contexts),
 * for the Location dropdown on task forms and the Clarify flow. Falls back to
 * the seeded defaults if the fetch fails so the dropdown is never empty.
 */
export function useContexts(): string[] {
  const [names, setNames] = useState<string[]>([...DEFAULT_LOCATIONS]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/contexts", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("contexts"))))
      .then((rows: { name: string }[]) => {
        if (rows.length) setNames(rows.map((r) => r.name));
      })
      .catch(() => {
        // Keep the defaults already in state.
      });
    return () => controller.abort();
  }, []);

  return names;
}
