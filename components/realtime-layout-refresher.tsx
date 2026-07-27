"use client";

import { useRouter } from "next/navigation";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

/**
 * Keeps the sidebar's server-fetched data (domain/project lists, inbox/
 * today/waiting-for counts) live across tabs — those are fetched in the
 * (protected) layout Server Component, so a plain router.refresh() re-runs
 * that fetch without a full page reload.
 */
export default function RealtimeLayoutRefresher() {
  const router = useRouter();
  // suppressLocalEcho: false — the sidebar's server-fetched data (project
  // lists, inbox/today counts) must refresh after THIS client's own writes
  // too; the echo-suppression window is only valid for a page skipping a
  // reload of the same data it just fetched.
  useRealtimeRefresh(["domains", "projects", "tasks"], () => router.refresh(), {
    suppressLocalEcho: false,
  });
  return null;
}
