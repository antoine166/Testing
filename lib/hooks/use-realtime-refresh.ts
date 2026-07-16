"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Postgres changes on the given tables and calls `onChange`
 * (debounced) whenever a row is inserted/updated/deleted — keeps
 * client-fetched page state in sync across tabs/devices without polling.
 * RLS scopes which rows a client actually receives, so this is safe to
 * mount per-page with a plain table name list.
 */
export function useRealtimeRefresh(tables: string[], onChange: () => void) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const tablesKey = tables.join(",");

  useEffect(() => {
    if (!tablesKey) return;

    const supabase = createClient();
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => onChangeRef.current(), 400);
    };

    let channel = supabase.channel(
      `db-changes-${tablesKey}-${Math.random().toString(36).slice(2)}`,
    );
    for (const table of tablesKey.split(",")) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          console.log("[realtime] change received", table, payload.eventType);
          scheduleRefresh();
        },
      );
    }
    channel.subscribe((status, err) => {
      console.log("[realtime] subscribe status", tablesKey, status, err ?? "");
    });

    return () => {
      if (timeout) clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [tablesKey]);
}
