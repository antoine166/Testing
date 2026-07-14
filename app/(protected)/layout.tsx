import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuickCapture from "@/components/quick-capture";
import SidebarNav from "@/components/sidebar-nav";
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

  const [domainsRes, projectsRes, inboxRes, todayRes, waitingForRes, contextsRes] =
    await Promise.all([
      supabase.from("domains").select("id, name, color").is("deleted_at", null).order("name"),
      supabase.from("projects").select("id, name, domain_id").is("deleted_at", null).order("name"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .is("domain_id", null)
        .eq("someday", false)
        .neq("status", "done"),
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
        .not("waiting_on", "is", null)
        .neq("status", "done"),
      supabase.from("tasks").select("context").not("context", "is", null),
    ]);

  const contexts = Array.from(
    new Set((contextsRes.data ?? []).map((t) => t.context as string)),
  ).sort();

  return (
    <>
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
    </>
  );
}
