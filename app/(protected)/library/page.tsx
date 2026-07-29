"use client";

import { useState, type FormEvent } from "react";
import KnowledgeItemRow, {
  KNOWLEDGE_TYPES,
  parseTags,
  type KnowledgeItem,
  type KnowledgeFolder,
  type KnowledgeProject,
  type KnowledgeType,
} from "@/components/knowledge-item-row";
import { usePageData } from "@/lib/hooks/use-page-data";
import { useConfirmDialog } from "@/components/confirm-dialog";

export default function LibraryPage() {
  const { confirm } = useConfirmDialog();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [projects, setProjects] = useState<KnowledgeProject[]>([]);
  const [creating, setCreating] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<KnowledgeType>("note");
  const [tagsInput, setTagsInput] = useState("");
  const [newItemProjectId, setNewItemProjectId] = useState("");

  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");

  const { loading, error, setError, reload: loadAll } = usePageData(
    async (signal) => {
      const [itemsRes, foldersRes, projectsRes] = await Promise.all([
        fetch("/api/knowledge-items", { signal }),
        fetch("/api/knowledge-folders", { signal }),
        fetch("/api/projects", { signal }),
      ]);
      if (!itemsRes.ok || !foldersRes.ok || !projectsRes.ok) throw new Error("Failed to load library");
      setItems(await itemsRes.json());
      setFolders(await foldersRes.json());
      setProjects(await projectsRes.json());
    },
    { tables: ["knowledge_items", "knowledge_folders", "projects"] },
  );

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);

    const res = await fetch("/api/knowledge-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content: content || undefined,
        url: url || undefined,
        type,
        tags: parseTags(tagsInput),
        folder_id: currentFolderId,
        project_id: newItemProjectId || undefined,
      }),
    });

    setCreating(false);
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to save item");
      return;
    }

    setTitle("");
    setContent("");
    setUrl("");
    setType("note");
    setTagsInput("");
    setNewItemProjectId("");
    await loadAll();
  }

  async function handleCreateFolder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newFolderName.trim() || creatingFolder) return;
    setCreatingFolder(true);

    const res = await fetch("/api/knowledge-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolderName, parent_id: currentFolderId }),
    });

    setCreatingFolder(false);
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create folder");
      return;
    }

    setNewFolderName("");
    await loadAll();
  }

  async function handleDeleteFolder(id: string) {
    if (
      !(await confirm({
        message: "Delete this folder? Subfolders go with it, but items inside just become unfiled.",
        confirmLabel: "Delete",
        danger: true,
      }))
    ) {
      return;
    }
    const res = await fetch(`/api/knowledge-folders/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete folder");
      return;
    }
    if (currentFolderId === id) setCurrentFolderId(null);
    await loadAll();
  }

  async function handleUpdate(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/knowledge-items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update item");
      return;
    }

    await loadAll();
  }

  async function handleDelete(id: string) {
    if (
      !(await confirm({
        message: "Move this item to trash? You can restore it within 30 days.",
        confirmLabel: "Move to Trash",
        danger: true,
      }))
    )
      return;

    const res = await fetch(`/api/knowledge-items/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete item");
      return;
    }

    await loadAll();
  }

  const allTags = [...new Set(items.flatMap((item) => item.tags ?? []))].sort();
  const isBrowsingAll = search.trim() !== "" || activeTag !== null;

  // Completed projects keep their reference material here, grouped under the
  // project (folder-style, at the Library root). Their items leave the root's
  // flat list so they only appear once — search and tag filters still find them.
  const completedProjectIds = new Set(
    projects.filter((p) => p.status === "completed").map((p) => p.id),
  );
  const completedGroups = projects
    .filter((p) => p.status === "completed")
    .map((project) => ({
      project,
      items: items.filter((item) => item.project_id === project.id),
    }))
    .filter((group) => group.items.length > 0);

  const filtered = items.filter((item) => {
    const matchesSearch =
      !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      (item.content ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesTag = !activeTag || (item.tags ?? []).includes(activeTag);
    const matchesFolder = isBrowsingAll || (item.folder_id ?? null) === currentFolderId;
    const groupedUnderCompletedProject =
      !isBrowsingAll &&
      currentFolderId === null &&
      item.project_id !== null &&
      completedProjectIds.has(item.project_id);
    return matchesSearch && matchesTag && matchesFolder && !groupedUnderCompletedProject;
  });

  // The completed-project groups render at the Library root only — inside a
  // folder or a search they'd be duplicate noise.
  const showCompletedSection =
    !isBrowsingAll && currentFolderId === null && completedGroups.length > 0;

  const foldersById = new Map(folders.map((f) => [f.id, f]));
  const subfolders = folders
    .filter((f) => f.parent_id === currentFolderId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const breadcrumb: KnowledgeFolder[] = [];
  let walk = currentFolderId ? foldersById.get(currentFolderId) : undefined;
  while (walk) {
    breadcrumb.unshift(walk);
    walk = walk.parent_id ? foldersById.get(walk.parent_id) : undefined;
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Library
      </h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-1 text-sm">
        <button
          onClick={() => setCurrentFolderId(null)}
          className={`rounded px-1.5 py-0.5 ${
            currentFolderId === null
              ? "font-semibold text-zinc-950 dark:text-zinc-50"
              : "text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
          }`}
        >
          📚 Library
        </button>
        {breadcrumb.map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <span className="text-zinc-400">/</span>
            <button
              onClick={() => setCurrentFolderId(f.id)}
              className={`rounded px-1.5 py-0.5 ${
                currentFolderId === f.id
                  ? "font-semibold text-zinc-950 dark:text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
              }`}
            >
              {f.name}
            </button>
          </span>
        ))}
      </div>

      {subfolders.length > 0 && (
        <ul className="mb-4 space-y-1">
          {subfolders.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <button
                onClick={() => setCurrentFolderId(f.id)}
                className="flex-1 text-left text-sm font-medium text-zinc-900 dark:text-zinc-100"
              >
                📁 {f.name}
              </button>
              <button
                onClick={() => handleDeleteFolder(f.id)}
                aria-label="Delete folder"
                title="Delete folder"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
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
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreateFolder} className="mb-6 flex gap-2">
        <input
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder="New folder name"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={creatingFolder}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          + Folder
        </button>
      </form>

      <form
        onSubmit={handleCreate}
        className="mb-8 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            New item
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Deep Work"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label
            htmlFor="content"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Content (optional)
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="type"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Type
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as KnowledgeType)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {KNOWLEDGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label
              htmlFor="url"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              URL (optional)
            </label>
            <input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="tags"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Tags (comma-separated)
          </label>
          <input
            id="tags"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="focus, productivity"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label
            htmlFor="item-project"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Project (optional)
          </label>
          <select
            id="item-project"
            value={newItemProjectId}
            onChange={(e) => setNewItemProjectId(e.target.value)}
            title="Attach as project support material — reference that belongs with a project, not on its action list."
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {creating ? "Adding..." : "Add"}
        </button>
      </form>

      <div className="mb-4 space-y-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or content..."
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTag(null)}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTag === null
                  ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  activeTag === tag
                    ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : (
        <>
          {filtered.length === 0 ? (
            showCompletedSection ? null : (
              <p className="text-sm text-zinc-500">
                {items.length === 0
                  ? "Nothing saved yet. Add your first item above."
                  : "No items match your search."}
              </p>
            )
          ) : (
            <ul className="space-y-3">
              {filtered.map((item) => (
                <KnowledgeItemRow
                  key={item.id}
                  item={item}
                  folders={folders}
                  projects={projects}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}

          {showCompletedSection && (
            <div className="mt-8">
              <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Completed projects
              </h2>
              <ul className="space-y-1">
                {completedGroups.map(({ project, items: groupItems }) => (
                  <li
                    key={project.id}
                    className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                  >
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        <span className="text-zinc-400 transition-transform group-open:rotate-90">
                          ›
                        </span>
                        📁 {project.name}
                        <span className="text-xs font-normal text-zinc-400">
                          ({groupItems.length})
                        </span>
                      </summary>
                      <ul className="mt-2 space-y-3">
                        {groupItems.map((item) => (
                          <KnowledgeItemRow
                            key={item.id}
                            item={item}
                            folders={folders}
                            projects={projects}
                            onUpdate={handleUpdate}
                            onDelete={handleDelete}
                          />
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
