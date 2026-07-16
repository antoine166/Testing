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
  useRealtimeRefresh(["domains", "projects", "tasks"], () => router.refresh());
  return null;
}
