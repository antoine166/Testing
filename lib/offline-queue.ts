// Offline queue for Quick Capture: if a capture's POST fails because
// there's no connection, it's stashed here (IndexedDB, so a photo File can
// ride along too — localStorage can't hold binary data) instead of being
// lost. Flushed automatically once the browser regains connectivity.

const DB_NAME = "life-os-offline-queue";
const DB_VERSION = 1;
const STORE_NAME = "captures";
const CHANGE_EVENT = "life-os:offline-queue-changed";

export type QueuedCapture = {
  id: string;
  createdAt: number;
  mode: "task" | "project";
  payload: Record<string, unknown>;
  /** Task-mode only; not queueable for projects (quick capture never offers one there). */
  image: File | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function notifyChanged() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onQueueChanged(handler: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

export async function enqueueCapture(entry: Omit<QueuedCapture, "id" | "createdAt">): Promise<void> {
  const db = await openDb();
  const full: QueuedCapture = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(full);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  notifyChanged();
}

async function listQueue(): Promise<QueuedCapture[]> {
  const db = await openDb();
  const entries = await new Promise<QueuedCapture[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as QueuedCapture[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return entries.sort((a, b) => a.createdAt - b.createdAt);
}

async function removeFromQueue(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  notifyChanged();
}

export async function queueLength(): Promise<number> {
  return (await listQueue()).length;
}

/**
 * Replays queued captures against the real API, oldest first. A network
 * error (still offline) stops the run, leaving the rest queued for next
 * time. A genuine server rejection (4xx/5xx) drops just that one entry
 * instead — retrying a rejected request forever wouldn't fix it.
 */
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const entries = await listQueue();
  let synced = 0;
  let failed = 0;

  for (const entry of entries) {
    let res: Response;
    try {
      res = await fetch(entry.mode === "project" ? "/api/projects" : "/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
    } catch {
      break;
    }

    if (!res.ok) {
      await removeFromQueue(entry.id);
      failed++;
      continue;
    }

    const created = await res.json();

    if (entry.mode === "task" && entry.image) {
      const formData = new FormData();
      formData.append("file", entry.image);
      // Same precedent as email-capture attachments: a photo failing to
      // attach doesn't undo the capture — the task is the important part.
      await fetch(`/api/tasks/${created.id}/attachments`, { method: "POST", body: formData }).catch(
        () => {},
      );
    }

    await removeFromQueue(entry.id);
    synced++;
  }

  return { synced, failed };
}
