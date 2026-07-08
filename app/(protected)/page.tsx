import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/actions/auth";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4 dark:bg-black">
      <p className="text-sm text-zinc-500">Signed in as {user?.email}</p>
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Life OS
      </h1>
      <p className="max-w-sm text-center text-sm text-zinc-500">
        Today view, Quick Capture, and the rest of Phase 1 land here next.
      </p>
      <div className="flex gap-4">
        <Link
          href="/domains"
          className="text-sm font-medium text-zinc-950 underline dark:text-zinc-50"
        >
          Manage domains
        </Link>
        <Link
          href="/projects"
          className="text-sm font-medium text-zinc-950 underline dark:text-zinc-50"
        >
          Manage projects
        </Link>
        <Link
          href="/tasks"
          className="text-sm font-medium text-zinc-950 underline dark:text-zinc-50"
        >
          Manage tasks
        </Link>
        <Link
          href="/checkin"
          className="text-sm font-medium text-zinc-950 underline dark:text-zinc-50"
        >
          Daily check-in
        </Link>
      </div>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Log out
        </button>
      </form>
    </div>
  );
}
