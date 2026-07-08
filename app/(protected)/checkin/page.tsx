"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { todayLocal } from "@/lib/date";
import LevelPicker from "@/components/level-picker";

type Checkin = {
  date: string;
  energy_level: number;
  focus_level: number;
  notes: string | null;
} | null;

export default function CheckinPage() {
  const [date] = useState(todayLocal);
  const [energyLevel, setEnergyLevel] = useState<number | null>(null);
  const [focusLevel, setFocusLevel] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/checkins?date=${date}`, { signal: controller.signal })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("Failed to load check-in")),
      )
      .then((data: Checkin) => {
        if (data) {
          setEnergyLevel(data.energy_level);
          setFocusLevel(data.focus_level);
          setNotes(data.notes ?? "");
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [date]);

  async function handleSave() {
    if (!energyLevel || !focusLevel) {
      setError("Pick an energy and focus level");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/checkins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        energy_level: energyLevel,
        focus_level: focusLevel,
        notes: notes || undefined,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to save check-in");
      return;
    }

    setSaved(true);
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Daily check-in
        </h1>
        <Link
          href="/"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
        >
          Back home
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : (
        <div className="space-y-6">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
              {error}
            </p>
          )}
          {saved && !error && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              Saved.
            </p>
          )}

          <LevelPicker
            label="Energy"
            value={energyLevel}
            onChange={(v) => {
              setEnergyLevel(v);
              setSaved(false);
            }}
          />
          <LevelPicker
            label="Focus"
            value={focusLevel}
            onChange={(v) => {
              setFocusLevel(v);
              setSaved(false);
            }}
          />

          <div>
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setSaved(false);
              }}
              rows={3}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {saving ? "Saving..." : "Save check-in"}
          </button>
        </div>
      )}
    </div>
  );
}
