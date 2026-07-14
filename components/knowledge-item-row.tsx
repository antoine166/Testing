"use client";

import { useState } from "react";

export type KnowledgeType = "note" | "article" | "book" | "quote" | "resource";

export type KnowledgeItem = {
  id: string;
  title: string;
  content: string | null;
  url: string | null;
  type: KnowledgeType;
  tags: string[] | null;
};

export const KNOWLEDGE_TYPES: KnowledgeType[] = [
  "note",
  "article",
  "book",
  "quote",
  "resource",
];

export function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function KnowledgeItemRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: KnowledgeItem;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content ?? "");
  const [url, setUrl] = useState(item.url ?? "");
  const [type, setType] = useState<KnowledgeType>(item.type);
  const [tagsInput, setTagsInput] = useState((item.tags ?? []).join(", "));

  function startEdit() {
    setTitle(item.title);
    setContent(item.content ?? "");
    setUrl(item.url ?? "");
    setType(item.type);
    setTagsInput((item.tags ?? []).join(", "));
    setEditing(true);
  }

  function handleSave() {
    if (!title.trim()) return;
    onUpdate(item.id, {
      title,
      content,
      url: url || null,
      type,
      tags: parseTags(tagsInput),
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Content"
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as KnowledgeType)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {KNOWLEDGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="URL (optional)"
              className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Tags, comma-separated"
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {item.title}
            </p>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {item.type}
            </span>
          </div>
          {item.content && (
            <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{item.content}</p>
          )}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block truncate text-sm text-blue-600 underline dark:text-blue-400"
            >
              {item.url}
            </a>
          )}
          {item.tags && item.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-3">
          <button
            onClick={startEdit}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="text-sm font-medium text-red-600 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
