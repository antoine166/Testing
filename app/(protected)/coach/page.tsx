"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { todayLocal } from "@/lib/date";

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string };
type ContentBlock = TextBlock | ToolUseBlock;

type RawMessage =
  | { role: "user"; content: string }
  | { role: "user"; content: ToolResultBlock[] }
  | { role: "assistant"; content: ContentBlock[] };

const TOOL_LABELS: Record<string, string> = {
  create_task: "Create task",
  update_task: "Update task",
  delete_task: "Delete task",
  create_project: "Create project",
  update_project: "Update project",
  delete_project: "Delete project",
  log_habit: "Log habit",
  create_domain: "Create domain",
  update_domain: "Update domain",
  create_routine: "Create routine",
  update_routine: "Update routine",
  delete_routine: "Delete routine",
  add_routine_item: "Add routine step",
  create_checklist: "Create checklist",
  update_checklist: "Rename checklist",
  delete_checklist: "Delete checklist",
  reset_checklist: "Reset checklist",
  add_checklist_item: "Add checklist item",
  create_knowledge_item: "Save to knowledge library",
  create_knowledge_folder: "Create library folder",
  update_knowledge_folder: "Update library folder",
};

function summarizeInput(input: Record<string, unknown>): string {
  return Object.entries(input)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

const REQUEST_TIMEOUT_MS = 45_000;

function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export default function CoachPage() {
  const searchParams = useSearchParams();
  const initialMode: "chat" | "weekly-review" =
    searchParams.get("mode") === "weekly-review" ? "weekly-review" : "chat";
  const [messages, setMessages] = useState<RawMessage[]>(() =>
    initialMode === "weekly-review"
      ? [{ role: "user", content: "Let's start my Weekly Review." }]
      : [],
  );
  const [mode] = useState(initialMode);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<Record<string, { approved: boolean }>>({});
  const [actionResults, setActionResults] = useState<Record<string, string>>({});
  const startedRef = useRef(false);

  async function sendTurn(nextMessages: RawMessage[], currentMode: string) {
    setSending(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, today: todayLocal(), mode: currentMode }),
      });

      if (!res.ok) {
        const message = await res
          .json()
          .then((body) => body.error)
          .catch(() => null);
        setError(message ?? `Coach is unavailable right now (${res.status}).`);
        return;
      }

      const data = await res.json();
      setMessages([...nextMessages, { role: "assistant", content: data.assistantContent }]);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "AbortError"
          ? "Coach took too long to respond — try again."
          : "Couldn't reach Coach — check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    if (mode !== "weekly-review") return;
    startedRef.current = true;
    // Kicking off the Weekly Review's first turn on mount is a one-time
    // network call, not state synchronized from an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    sendTurn(messages, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userMessage: RawMessage = { role: "user", content: input };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    await sendTurn(nextMessages, mode);
  }

  async function fireConfirmIfReady(statusMap: Record<string, { approved: boolean }>) {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const actionBlocks = last.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (actionBlocks.length === 0) return;
    if (!actionBlocks.every((b) => statusMap[b.id] !== undefined)) return;

    setSending(true);
    setError(null);
    const resolutions = actionBlocks.map((b) => ({
      tool_use_id: b.id,
      approved: statusMap[b.id].approved,
    }));

    try {
      const res = await fetchWithTimeout("/api/coach/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, resolutions, today: todayLocal(), mode }),
      });

      if (!res.ok) {
        const message = await res
          .json()
          .then((body) => body.error)
          .catch(() => null);
        setError(message ?? `Failed to apply actions (${res.status}).`);
        return;
      }

      const data = await res.json();
      const results: Record<string, string> = {};
      for (const tr of data.toolResults ?? []) {
        results[tr.tool_use_id] = tr.content;
      }
      setActionResults((prev) => ({ ...prev, ...results }));
      setMessages((prev) => [
        ...prev,
        { role: "user", content: data.toolResults ?? [] },
        { role: "assistant", content: data.assistantContent },
      ]);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "AbortError"
          ? "Coach took too long to respond — try again."
          : "Couldn't reach Coach — check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  }

  function resolveAction(id: string, approved: boolean) {
    const next = { ...actionStatus, [id]: { approved } };
    setActionStatus(next);
    fireConfirmIfReady(next);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Coach{mode === "weekly-review" ? " — Weekly Review" : ""}
      </h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mb-4 flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500">
            Ask something like &quot;What should I focus on today?&quot; or tell it what
            you got done — it can propose creating tasks, logging habits, and more (you
            approve each action before it happens).
          </p>
        )}
        {messages.map((m, i) => {
          if (m.role === "user" && typeof m.content === "string") {
            return (
              <div
                key={i}
                className="ml-auto max-w-[85%] rounded-lg bg-zinc-950 px-3 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-950"
              >
                {m.content}
              </div>
            );
          }
          if (m.role === "assistant") {
            return (
              <div key={i} className="space-y-2">
                {m.content.map((block, bi) => {
                  if (block.type === "text" && block.text) {
                    return (
                      <div
                        key={bi}
                        className="max-w-[85%] rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        {block.text}
                      </div>
                    );
                  }
                  if (block.type === "tool_use") {
                    const status = actionStatus[block.id];
                    const result = actionResults[block.id];
                    return (
                      <div
                        key={bi}
                        className="max-w-[85%] rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                      >
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {TOOL_LABELS[block.name] ?? block.name}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">{summarizeInput(block.input)}</p>
                        {!status ? (
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => resolveAction(block.id, true)}
                              className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => resolveAction(block.id, false)}
                              className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <p
                            className={`mt-2 text-xs font-medium ${
                              status.approved
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-zinc-500"
                            }`}
                          >
                            {status.approved
                              ? (result ?? "Applying...")
                              : "Declined"}
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            );
          }
          return null;
        })}
        {sending && <p className="text-sm text-zinc-500">Thinking...</p>}
      </div>

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your coach..."
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Send
        </button>
      </form>
    </div>
  );
}
