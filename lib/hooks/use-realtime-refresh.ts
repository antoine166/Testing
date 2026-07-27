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
// postgres_changes events don't say which client caused them, so a page's
// own write comes back as an event ~100–500ms later and re-runs the full
// reload it just did. Pages call markLocalRefresh() at the start of their
// post-mutation reload; any event landing inside this window is redundant
// by construction (the reload reads state that already includes the write).
const LOCAL_REFRESH_WINDOW_MS = 1000;
let lastLocalRefresh = 0;

export function markLocalRefresh() {
  lastLocalRefresh = Date.now();
}

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
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const scheduleRefresh = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        // Skip the self-echo: this page (or another mounted hook) just did a
        // full reload, so refetching again would return identical data. A
        // genuinely remote write in this window was either captured by that
        // reload or will arrive as its own later event.
        if (Date.now() - lastLocalRefresh < LOCAL_REFRESH_WINDOW_MS) return;
        onChangeRef.current();
        // Fires only in response to an actual postgres_changes event (never
        // on initial mount), so this is a reliable "a change from elsewhere
        // just landed" signal for the RealtimeIndicator badge.
        window.dispatchEvent(new Event("life-os:realtime-sync"));
      }, 400);
    };

    // supabase-js only re-sends the JWT to Realtime on TOKEN_REFRESHED/SIGNED_IN,
    // not on INITIAL_SESSION (an already-logged-in tab restoring its session on
    // load) — so without this, Realtime authenticates as anon and RLS silently
    // drops every postgres_changes event.
    supabase.realtime.setAuth().then(() => {
      if (cancelled) return;

      let ch = supabase.channel(
        `db-changes-${tablesKey}-${Math.random().toString(36).slice(2)}`,
      );
      for (const table of tablesKey.split(",")) {
        ch = ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => scheduleRefresh(),
        );
      }
      channel = ch;
      ch.subscribe();
    });

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tablesKey]);
}
