export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Settings
      </h1>

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Export your data
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Download everything — domains, projects, tasks, habits and their logs,
          check-ins, routines, and library items — as a single JSON file.
        </p>
        <a
          href="/api/export"
          className="mt-3 inline-block rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Download my data
        </a>
      </div>
    </div>
  );
}
