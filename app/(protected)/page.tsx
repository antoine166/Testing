import { createClient } from "@/lib/supabase/server";
import TodayDashboard from "@/components/today-dashboard";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Today
        </h1>
        <p className="text-sm text-zinc-500">Signed in as {user?.email}</p>
      </div>

      <TodayDashboard />
    </div>
  );
}
