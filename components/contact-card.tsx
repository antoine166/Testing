"use client";

import { useEffect, useState, type FormEvent } from "react";

export type RelationshipType = "personal" | "professional" | "mentor" | "client" | "other";

export type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  relationship_type: RelationshipType;
  notes: string | null;
  last_contacted_at: string | null;
};

type InteractionType = "call" | "email" | "meeting" | "message" | "note";

type Interaction = {
  id: string;
  type: InteractionType;
  notes: string | null;
  interacted_at: string;
};

export const RELATIONSHIP_TYPES: RelationshipType[] = [
  "personal",
  "professional",
  "mentor",
  "client",
  "other",
];

const INTERACTION_TYPES: InteractionType[] = ["call", "email", "meeting", "message", "note"];

export default function ContactCard({
  contact,
  onUpdate,
  onDelete,
  onInteractionLogged,
}: {
  contact: Contact;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onInteractionLogged: () => void;
}) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [showInteractions, setShowInteractions] = useState(false);
  const [loadingInteractions, setLoadingInteractions] = useState(false);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [company, setCompany] = useState(contact.company ?? "");
  const [role, setRole] = useState(contact.role ?? "");
  const [relationshipType, setRelationshipType] = useState<RelationshipType>(
    contact.relationship_type,
  );
  const [notes, setNotes] = useState(contact.notes ?? "");

  const [interactionType, setInteractionType] = useState<InteractionType>("call");
  const [interactionNotes, setInteractionNotes] = useState("");

  async function loadInteractions() {
    const res = await fetch(`/api/contacts/${contact.id}/interactions`);
    if (res.ok) setInteractions(await res.json());
  }

  useEffect(() => {
    if (!showInteractions) return;

    const controller = new AbortController();

    fetch(`/api/contacts/${contact.id}/interactions`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((data: Interaction[]) => setInteractions(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      })
      .finally(() => setLoadingInteractions(false));

    return () => controller.abort();
  }, [showInteractions, contact.id]);

  function startEdit() {
    setName(contact.name);
    setEmail(contact.email ?? "");
    setPhone(contact.phone ?? "");
    setCompany(contact.company ?? "");
    setRole(contact.role ?? "");
    setRelationshipType(contact.relationship_type);
    setNotes(contact.notes ?? "");
    setEditing(true);
  }

  function handleSave() {
    if (!name.trim()) return;
    onUpdate(contact.id, {
      name,
      email: email || null,
      phone: phone || null,
      company: company || null,
      role: role || null,
      relationship_type: relationshipType,
      notes: notes || null,
    });
    setEditing(false);
  }

  async function handleLogInteraction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const res = await fetch(`/api/contacts/${contact.id}/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: interactionType, notes: interactionNotes || undefined }),
    });

    if (res.ok) {
      setInteractionNotes("");
      await loadInteractions();
      onInteractionLogged(); // refresh parent list so last_contacted_at updates
    }
  }

  async function handleDeleteInteraction(id: string) {
    await fetch(`/api/contact-interactions/${id}`, { method: "DELETE" });
    await loadInteractions();
  }

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      {editing ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <select
              value={relationshipType}
              onChange={(e) => setRelationshipType(e.target.value as RelationshipType)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {RELATIONSHIP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone"
              className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company"
              className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Role"
              className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notes"
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
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {contact.name}
              </p>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {contact.relationship_type}
              </span>
            </div>
            {(contact.role || contact.company) && (
              <p className="text-sm text-zinc-500">
                {[contact.role, contact.company].filter(Boolean).join(" at ")}
              </p>
            )}
            {(contact.email || contact.phone) && (
              <p className="text-sm text-zinc-500">
                {[contact.email, contact.phone].filter(Boolean).join(" · ")}
              </p>
            )}
            {contact.notes && <p className="mt-1 text-sm text-zinc-500">{contact.notes}</p>}
            <p className="mt-1 text-xs text-zinc-500">
              Last contacted:{" "}
              {contact.last_contacted_at
                ? new Date(contact.last_contacted_at).toLocaleDateString()
                : "never"}
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <button
              onClick={startEdit}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(contact.id)}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          if (!showInteractions) setLoadingInteractions(true);
          setShowInteractions((s) => !s);
        }}
        className="mt-3 text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
      >
        {showInteractions ? "Hide interactions" : "Show interactions"}
      </button>

      {showInteractions && (
        <div className="mt-2 space-y-2">
          {loadingInteractions ? (
            <p className="text-xs text-zinc-500">Loading...</p>
          ) : interactions.length === 0 ? (
            <p className="text-xs text-zinc-500">No interactions logged yet.</p>
          ) : (
            <ul className="space-y-1">
              {interactions.map((interaction) => (
                <li
                  key={interaction.id}
                  className="flex items-center gap-2 rounded-md bg-zinc-50 px-2 py-1 text-xs dark:bg-zinc-900"
                >
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {interaction.type}
                  </span>
                  <span className="text-zinc-500">
                    {new Date(interaction.interacted_at).toLocaleDateString()}
                  </span>
                  {interaction.notes && (
                    <span className="flex-1 text-zinc-500">{interaction.notes}</span>
                  )}
                  <button
                    onClick={() => handleDeleteInteraction(interaction.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleLogInteraction} className="flex gap-2">
            <select
              value={interactionType}
              onChange={(e) => setInteractionType(e.target.value as InteractionType)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {INTERACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              value={interactionNotes}
              onChange={(e) => setInteractionNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="rounded-md bg-zinc-950 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Log
            </button>
          </form>
        </div>
      )}
    </li>
  );
}
