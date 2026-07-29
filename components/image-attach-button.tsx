"use client";

/**
 * The camera-icon attach control + "filename ✕" remove chip the capture
 * forms share. Extracted verbatim in the July 2026 capture-form split —
 * no behavior change.
 */
export default function ImageAttachButton({
  image,
  onChange,
}: {
  image: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <>
      <label
        aria-label="Add image"
        title={image ? image.name : "Add image"}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10.5" r="1.5" />
          <path d="M3 16l5-4 4 3 4-3 5 4" />
          <path d="M15 6h4M17 4v4" />
        </svg>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </label>
      {image && (
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Remove image"
          className="flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
        >
          {image.name} ✕
        </button>
      )}
    </>
  );
}
