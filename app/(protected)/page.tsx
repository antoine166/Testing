import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TodayDashboard from "@/components/today-dashboard";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Today
          </h1>
          <p className="text-sm text-zinc-500">Signed in as {user?.email}</p>
        </div>
        <Link
          href="/coach?mode=weekly-review"
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          🔭 Start Weekly Review
        </Link>
      </div>

      <TodayDashboard />
    </div>
  );
}
