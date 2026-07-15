"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function GmailDisconnectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDisconnect() {
    if (!confirm("Disconnect Gmail? Forwarded emails will go back to best-guess link parsing.")) {
      return;
    }
    setBusy(true);
    await fetch("/api/gmail/disconnect", { method: "POST" });
    router.refresh();
  }

  return (
    <button
      onClick={handleDisconnect}
      disabled={busy}
      className="mt-3 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      {busy ? "Disconnecting..." : "Disconnect Gmail"}
    </button>
  );
}
