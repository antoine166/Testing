import { createClient } from "@/lib/supabase/server";
import { isGmailConfigured } from "@/lib/gmail/client";
import GmailDisconnectButton from "@/components/gmail-connection";

const GMAIL_STATUS_MESSAGES: Record<string, { text: string; tone: "success" | "error" }> = {
  connected: { text: "Gmail connected.", tone: "success" },
  denied: { text: "Gmail connection cancelled.", tone: "error" },
  error: { text: "Couldn't connect Gmail — try again.", tone: "error" },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const { gmail } = await searchParams;
  const statusMessage = gmail ? GMAIL_STATUS_MESSAGES[gmail] : undefined;

  const supabase = await createClient();
  const { data: connections } = await supabase
    .from("gmail_connections")
    .select("id, email, created_at")
    .order("created_at");

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Settings
      </h1>

      {statusMessage && (
        <p
          className={`mb-4 rounded-md px-3 py-2 text-sm ${
            statusMessage.tone === "success"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
          }`}
        >
          {statusMessage.text}
        </p>
      )}

      <div className="mb-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Gmail</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Connect one or more Gmail accounts so forwarded emails (3.1a) get linked back to
          the original message in Gmail automatically, instead of relying on a link pasted
          into the forward — a forwarded email is checked against every account connected
          here. Read-only — Life OS never reads message content, only looks up a
          message&apos;s ID by the Message-ID it already captures.
        </p>
        {!isGmailConfigured() ? (
          <p className="mt-3 text-sm text-zinc-500">
            Not set up yet — this needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
            configured on the server.
          </p>
        ) : (
          <>
            {connections && connections.length > 0 && (
              <ul className="mt-3 space-y-2">
                {connections.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                  >
                    <span className="text-sm text-emerald-600 dark:text-emerald-400">
                      ✓ {c.email ?? "Connected account (reconnect to see its email)"}
                      <span className="ml-1 text-xs text-zinc-500">
                        since {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </span>
                    <GmailDisconnectButton connectionId={c.id} label={c.email ?? "this account"} />
                  </li>
                ))}
              </ul>
            )}
            <a
              href="/api/gmail/connect"
              className="mt-3 inline-block rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {connections && connections.length > 0 ? "Connect another account" : "Connect Gmail"}
            </a>
          </>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Export your data
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Download everything — domains, projects, tasks, habits and their logs,
          check-ins, routines, checklists, and library items — as a single JSON file.
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
