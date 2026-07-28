import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuickCapture from "@/components/quick-capture";
import SidebarNav from "@/components/sidebar-nav";
import RealtimeLayoutRefresher from "@/components/realtime-layout-refresher";
import RealtimeIndicator from "@/components/realtime-indicator";
import OfflineQueueIndicator from "@/components/offline-queue-indicator";
import { ToastProvider } from "@/components/toast";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { todayLocal } from "@/lib/date";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const today = todayLocal();

  const [domainsRes, projectsRes, inboxRes, todayRes, waitingForRes, taskContextsRes, savedContextsRes] =
    await Promise.all([
      supabase.from("domains").select("id, name, color").is("deleted_at", null).order("name"),
      supabase
        .from("projects")
        .select("id, name, domain_id, parent_project_id")
        .is("deleted_at", null)
        .order("name"),
      // The SQL mirror of isInInbox (lib/tasks/inbox.ts) — this one has to
      // count without fetching the rows, so it can't reuse the predicate
      // directly. Keep the two in step: unfiled, not delegated, not done,
      // and Someday only once its revisit date has arrived.
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .is("domain_id", null)
        .eq("waiting_for", false)
        .neq("status", "done")
        .or(`someday.eq.false,revisit_date.lte.${today}`),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .not("scheduled_date", "is", null)
        .lte("scheduled_date", today)
        .neq("status", "done"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("waiting_for", true)
        .neq("status", "done"),
      supabase.from("tasks").select("context").not("context", "is", null),
      supabase.from("contexts").select("name"),
    ]);

  // Merges contexts already in use on tasks with the standalone saved list
  // (contexts table) — the latter lets a context exist and be selectable
  // before any task has used it yet.
  const contexts = Array.from(
    new Set([
      ...(taskContextsRes.data ?? []).map((t) => t.context as string),
      ...(savedContextsRes.data ?? []).map((c) => c.name as string),
    ]),
  ).sort();

  return (
    <ToastProvider>
      <ConfirmDialogProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Suspense fallback={<div className="w-64 shrink-0" />}>
          <SidebarNav
            userEmail={user.email}
            domains={domainsRes.data ?? []}
            projects={projectsRes.data ?? []}
            inboxCount={inboxRes.count ?? 0}
            todayCount={todayRes.count ?? 0}
            waitingForCount={waitingForRes.count ?? 0}
          />
        </Suspense>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <datalist id="task-contexts">
        {contexts.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <QuickCapture />
      <RealtimeLayoutRefresher />
      <RealtimeIndicator />
      <OfflineQueueIndicator />
      </ConfirmDialogProvider>
    </ToastProvider>
  );
}
