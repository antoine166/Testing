"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * In-app replacement for window.confirm()/prompt() (#118). In the
 * installed PWA the native dialogs render as bare "testing-xyz.vercel.app
 * says:" popups — unstylable, and iOS standalone mode handles them badly.
 *
 * Same provider pattern as the toast system: one provider near the root,
 * `useConfirmDialog()` anywhere below it. Both functions return promises
 * so call sites read like the native versions:
 *
 *   if (!(await confirm({ message: "Move this task to trash?" }))) return;
 *   const name = await prompt({ message: "Template name:", defaultValue: p.name });
 *   if (name === null) return; // cancelled — same contract as window.prompt
 */
type ConfirmOptions = {
  message: string;
  /** Defaults to "Confirm". */
  confirmLabel?: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
};

type PromptOptions = {
  message: string;
  defaultValue?: string;
  placeholder?: string;
  /** Defaults to "Save". */
  confirmLabel?: string;
};

type DialogState =
  | ({ kind: "confirm"; resolve: (value: boolean) => void } & ConfirmOptions)
  | ({ kind: "prompt"; resolve: (value: string | null) => void } & PromptOptions);

type ConfirmDialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

export function useConfirmDialog(): ConfirmDialogContextValue {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) throw new Error("useConfirmDialog must be used inside <ConfirmDialogProvider>");
  return ctx;
}

/** How long the dialog's out-animation plays before unmount (#141). */
const DIALOG_CLOSE_MS = 180;

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  // `id` keys the shell so a re-entrant dialog (opened from a resolution
  // callback) remounts fresh — focus and enter animation both replay.
  const [dialog, setDialog] = useState<(DialogState & { id: number }) | null>(null);
  const [closing, setClosing] = useState(false);
  const [promptValue, setPromptValue] = useState("");
  const nextId = useRef(0);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setClosing(false);
      setDialog({ kind: "confirm", resolve, id: nextId.current++, ...options });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setPromptValue(options.defaultValue ?? "");
      setClosing(false);
      setDialog({ kind: "prompt", resolve, id: nextId.current++, ...options });
    });
  }, []);

  function close(result: boolean | string | null) {
    if (!dialog || closing) return;
    const d = dialog;
    // Resolve immediately — the caller's action keeps its exact timing;
    // only the visual teardown is delayed for the exit animation. The
    // identity check below keeps a re-entrant dialog opened from the
    // resolution callback from being clobbered by this one's teardown.
    if (d.kind === "confirm") d.resolve(result === true);
    else d.resolve(typeof result === "string" ? result : null);
    if (prefersReducedMotion()) {
      setDialog((prev) => (prev === d ? null : prev));
      return;
    }
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setDialog((prev) => (prev === d ? null : prev));
    }, DIALOG_CLOSE_MS);
  }

  return (
    <ConfirmDialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {dialog && (
        <DialogShell
          key={dialog.id}
          dialog={dialog}
          closing={closing}
          promptValue={promptValue}
          setPromptValue={setPromptValue}
          onClose={close}
        />
      )}
    </ConfirmDialogContext.Provider>
  );
}

function DialogShell({
  dialog,
  closing,
  promptValue,
  setPromptValue,
  onClose,
}: {
  dialog: DialogState;
  /** Exit animation window (#141): the dialog has resolved and is animating out. */
  closing: boolean;
  promptValue: string;
  setPromptValue: (v: string) => void;
  onClose: (result: boolean | string | null) => void;
}) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the safe default: the input for prompts, the confirm button for
  // confirms — Enter then submits, Escape cancels, like the native dialogs.
  useEffect(() => {
    if (dialog.kind === "prompt") inputRef.current?.select();
    else primaryRef.current?.focus();
  }, [dialog.kind]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose(null);
      }
    }
    // Capture phase so page-level Escape handlers (Quick Capture's close,
    // the Clarify overlay) don't also fire underneath the dialog.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    onClose(dialog.kind === "prompt" ? promptValue : true);
  }

  return (
    <div
      className={`modal-overlay ${closing ? "modal-closing" : ""} fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4`}
      onClick={() => onClose(null)}
      role="presentation"
    >
      <div
        role={dialog.kind === "confirm" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-label={dialog.message}
        className="modal-panel w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
          {dialog.message}
        </p>

        {dialog.kind === "prompt" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              ref={inputRef}
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={dialog.placeholder}
              autoFocus
              className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </form>
        )}

        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onClose(null)}
            className="rounded-md px-3 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            {(dialog.kind === "confirm" && dialog.cancelLabel) || "Cancel"}
          </button>
          <button
            type="button"
            ref={primaryRef}
            onClick={submit}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
              dialog.kind === "confirm" && dialog.danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-zinc-950 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            }`}
          >
            {dialog.confirmLabel ?? (dialog.kind === "prompt" ? "Save" : "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
