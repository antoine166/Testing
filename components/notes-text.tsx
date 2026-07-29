"use client";

import { useState } from "react";

/**
 * Task/item notes with a natural preview (#153): the first few *lines*
 * (CSS line-clamp, so a pasted email previews as its real first lines,
 * not a 200-character wall) and a Show more toggle. Both states render
 * the same whitespace-pre-wrap text, so the formatting the notes were
 * written in — line breaks, spacing — is identical collapsed and
 * expanded; the clamp only hides, never reflows.
 */
const PREVIEW_LINES = 3;
// Rough visual overflow guess for the toggle: more lines than the clamp
// shows, or enough text that three lines can't hold it. Cheap and
// SSR-safe; worst case a short-but-wide note shows a toggle that expands
// to nothing extra.
const LONG_TEXT_CHARS = 240;

export default function NotesText({ notes }: { notes: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong =
    notes.split("\n").length > PREVIEW_LINES || notes.length > LONG_TEXT_CHARS;

  return (
    <div className="mt-0.5 text-sm text-zinc-500">
      <p
        className={`whitespace-pre-wrap ${expanded || !isLong ? "" : "line-clamp-3"}`}
      >
        {notes}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
