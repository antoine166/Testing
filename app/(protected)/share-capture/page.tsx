"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * Target of the PWA's share_target (see app/manifest.ts) — lets Android's
 * native "Share" sheet send a link/selection from any app straight into
 * the Inbox, no domain/project decision required, matching Quick
 * Capture's capture-first philosophy. iOS Safari doesn't support the Web
 * Share Target API, so this path is Android/Chrome-only for now.
 */
export default function ShareCapturePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState("Saving to Inbox...");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const title = searchParams.get("title")?.trim() ?? "";
    const text = searchParams.get("text")?.trim() ?? "";
    const url = searchParams.get("url")?.trim() ?? "";

    const finalTitle = title || text.slice(0, 120) || url || "Shared item";
    const notes = text && text !== finalTitle ? text : undefined;

    fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: finalTitle, notes, link: url || undefined }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to save");
        setStatus("Saved to Inbox.");
        setTimeout(() => router.replace("/inbox"), 900);
      })
      .catch(() => {
        setStatus("Couldn't save — check your connection and try again.");
        setFailed(true);
      });
    // Only ever run once per share, regardless of searchParams identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <p className={`text-sm ${failed ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>{status}</p>
    </div>
  );
}
