"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirmDialog } from "@/components/confirm-dialog";

export default function GmailDisconnectButton({
  connectionId,
  label,
}: {
  connectionId: string;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { confirm } = useConfirmDialog();

  async function handleDisconnect() {
    if (
      !(await confirm({
        message: `Disconnect ${label}? Forwarded emails will stop checking this account for a link.`,
        confirmLabel: "Disconnect",
        danger: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    await fetch("/api/gmail/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connection_id: connectionId }),
    });
    router.refresh();
  }

  return (
    <button
      onClick={handleDisconnect}
      disabled={busy}
      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      {busy ? "Disconnecting..." : "Disconnect"}
    </button>
  );
}
