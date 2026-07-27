"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import Link from "next/link";

/** Either a navigation ("View project") or a callback ("Undo") — not both. */
type ToastAction = { label: string; href: string; onClick?: never } | { label: string; onClick: () => void; href?: never };

type Toast = {
  id: number;
  message: string;
  action?: ToastAction;
};

type ToastContextValue = {
  /** Show a transient confirmation, optionally with a link ("View project"). */
  showToast: (message: string, action?: ToastAction) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/**
 * Shared message for every "task → project" call site: the task vanishes from
 * whatever list it was on (projects don't live in smart lists), so the toast
 * must say where it went — otherwise the conversion reads as the item
 * disappearing. Spread into showToast: showToast(...projectConversionToast(p, domains)).
 */
export function projectConversionToast(
  project: { name: string; domain_id: string | null },
  domains: Array<{ id: string; name: string }>,
): [string, ToastAction] {
  const domainName = domains.find((d) => d.id === project.domain_id)?.name;
  return [
    `“${project.name}” is now a project${domainName ? ` in ${domainName}` : ""}`,
    {
      label: "View project",
      href: project.domain_id ? `/projects?domain=${project.domain_id}` : "/projects",
    },
  ];
}

/** Task → recurring series: the task leaves this list; occurrences appear on Upcoming. */
export function recurringConversionToast(template: { title: string }): [string, ToastAction] {
  return [
    `“${template.title}” now repeats — occurrences added to Upcoming`,
    { label: "View", href: "/upcoming" },
  ];
}

/** Task → reference: the task leaves the action lists entirely; it lives in the Library now. */
export function knowledgeConversionToast(item: { title: string }): [string, ToastAction] {
  return [`“${item.title}” filed in the Library`, { label: "View", href: "/library" }];
}

/** Tickler note → task: lands in the Inbox, which is rarely the page the user is on. */
export function ticklerConversionToast(task: { title?: string } | null): [string, ToastAction] {
  return [
    task?.title ? `Task created in Inbox: “${task.title}”` : "Task created in your Inbox",
    { label: "View Inbox", href: "/inbox" },
  ];
}

/** After a trash-backed delete: say it's recoverable and offer the way back. */
export function taskTrashedToast(undo: () => void): [string, ToastAction] {
  return ["Moved to Trash", { label: "Undo", onClick: undo }];
}

const DISMISS_AFTER_MS = 6000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, action?: ToastAction) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, action }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-800 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <span className="min-w-0">{toast.message}</span>
              {toast.action &&
                (toast.action.href ? (
                  <Link
                    href={toast.action.href}
                    onClick={() => dismiss(toast.id)}
                    className="shrink-0 font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {toast.action.label}
                  </Link>
                ) : (
                  <button
                    onClick={() => {
                      dismiss(toast.id);
                      toast.action?.onClick?.();
                    }}
                    className="shrink-0 font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {toast.action.label}
                  </button>
                ))}
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
