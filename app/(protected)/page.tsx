import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/actions/auth";
import TodayDashboard from "@/components/today-dashboard";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Today
          </h1>
          <p className="text-sm text-zinc-500">Signed in as {user?.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/domains"
            className="text-sm font-medium text-zinc-950 underline dark:text-zinc-50"
          >
            Domains
          </Link>
          <Link
            href="/projects"
            className="text-sm font-medium text-zinc-950 underline dark:text-zinc-50"
          >
            Projects
          </Link>
          <Link
            href="/tasks"
            className="text-sm font-medium text-zinc-950 underline dark:text-zinc-50"
          >
            Tasks
          </Link>
          <Link
            href="/habits"
            className="text-sm font-medium text-zinc-950 underline dark:text-zinc-50"
          >
            Habits
          </Link>
          <Link
            href="/checkin"
            className="text-sm font-medium text-zinc-950 underline dark:text-zinc-50"
          >
            Check-in
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Log out
            </button>
          </form>
        </div>
      </div>

      <TodayDashboard />
    </div>
  );
}
