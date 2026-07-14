"use client";

import { useEffect, useState } from "react";

export default function HorizonsPage() {
  const [goals, setGoals] = useState("");
  const [vision, setVision] = useState("");
  const [purpose, setPurpose] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/horizons", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((data) => {
        setGoals(data.goals ?? "");
        setVision(data.vision ?? "");
        setPurpose(data.purpose ?? "");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/horizons", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goals, vision, purpose }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Failed to save");
      return;
    }
    setError(null);
    setSaved(true);
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Horizons of Focus
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        The higher levels above your projects and next actions — review these as needed, not
        daily. Domains already cover Horizon 2 (Areas of Focus).
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Horizon 3 — Goals &amp; Objectives
            </label>
            <p className="mb-1 text-xs text-zinc-500">
              1–2 year outcomes for your life and work.
            </p>
            <textarea
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Horizon 4 — Vision
            </label>
            <p className="mb-1 text-xs text-zinc-500">
              3–5 year ideal scenarios of wild success.
            </p>
            <textarea
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Horizon 5 — Purpose &amp; Principles
            </label>
            <p className="mb-1 text-xs text-zinc-500">
              Why you exist, and the core values everything else derives from.
            </p>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {saved && <span className="text-sm text-emerald-600">Saved.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
