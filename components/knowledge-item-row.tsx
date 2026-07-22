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
  folder_id: string | null;
  project_id: string | null;
};

export type KnowledgeProject = { id: string; name: string };

export type KnowledgeFolder = { id: string; name: string; parent_id: string | null };

/** Flattens the folder tree into an indented, depth-first list for a <select>. */
export function flattenFolders(
  folders: KnowledgeFolder[],
  parentId: string | null = null,
  depth = 0,
): { id: string; label: string }[] {
  return folders
    .filter((f) => f.parent_id === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((f) => [
      { id: f.id, label: `${"— ".repeat(depth)}${f.name}` },
      ...flattenFolders(folders, f.id, depth + 1),
    ]);
}

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
  folders,
  projects,
  onUpdate,
  onDelete,
}: {
  item: KnowledgeItem;
  folders: KnowledgeFolder[];
  projects: KnowledgeProject[];
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content ?? "");
  const [url, setUrl] = useState(item.url ?? "");
  const [type, setType] = useState<KnowledgeType>(item.type);
  const [tagsInput, setTagsInput] = useState((item.tags ?? []).join(", "));
  const [folderId, setFolderId] = useState(item.folder_id ?? "");
  const [projectId, setProjectId] = useState(item.project_id ?? "");

  function startEdit() {
    setTitle(item.title);
    setContent(item.content ?? "");
    setUrl(item.url ?? "");
    setType(item.type);
    setTagsInput((item.tags ?? []).join(", "));
    setFolderId(item.folder_id ?? "");
    setProjectId(item.project_id ?? "");
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
      folder_id: folderId || null,
      project_id: projectId || null,
    });
    setEditing(false);
  }

  const folderOptions = flattenFolders(folders);
  const currentFolder = folders.find((f) => f.id === item.folder_id);
  const currentProject = projects.find((p) => p.id === item.project_id);

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
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Unfiled</option>
            {folderOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            title="Attach as project support material — reference that belongs with a project, not on its action list."
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
            {currentFolder && (
              <span className="text-xs text-zinc-400">📁 {currentFolder.name}</span>
            )}
            {currentProject && (
              <span className="text-xs text-zinc-400">🗂️ {currentProject.name}</span>
            )}
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
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={startEdit}
            aria-label="Edit item"
            title="Edit item"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
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
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(item.id)}
            aria-label="Delete item"
            title="Delete item"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
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
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>
    </li>
  );
}
