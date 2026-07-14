"use client";

import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

// Server Components can trigger a token refresh but can't persist the
// result (see lib/supabase/server.ts). This keeps the session's cookies
// genuinely refreshed for tabs left open and idle past the access token's
// lifetime, instead of relying on the next full page load to catch it.
export default function SessionRefresh() {
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/auth/refresh", { method: "POST" }).catch(() => {});
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  return null;
}
