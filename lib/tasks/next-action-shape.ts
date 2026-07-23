// GTD's clarify test: a next action is a visible physical behavior ("Call
// Dr. Lee to book the follow-up"), not a topic ("Mom", "taxes", "dentist").
// This heuristic backs the *gentle* nudges in the Clarify flow and the
// Weekly Review — it must never block anything, so it errs toward staying
// quiet: only titles that are confidently topic-shaped get flagged.

// Imperative first words that read as a physical action. Deliberately a
// generous list — a false "looks fine" is harmless, a false "looks vague"
// is nagging.
const ACTION_VERBS = new Set([
  "add", "answer", "apply", "arrange", "ask", "attend", "back", "backup", "book",
  "brainstorm", "bring", "build", "buy", "calendar", "call", "cancel", "change",
  "charge", "check", "choose", "clean", "clear", "collect", "compare", "complete",
  "confirm", "contact", "cook", "copy", "create", "decide", "delete", "deliver",
  "deposit", "design", "dm", "do", "download", "draft", "drive", "drop", "edit",
  "email", "enroll", "enter", "fill", "film", "find", "finish", "fix", "fold",
  "follow", "get", "give", "go", "grab", "hang", "install", "invite", "list",
  "listen", "log", "look", "mail", "make", "measure", "meet", "message", "move",
  "order", "organize", "outline", "pack", "pay", "phone", "pick", "plan", "post",
  "practice", "prep", "prepare", "print", "publish", "put", "read", "record",
  "register", "renew", "rent", "reply", "research", "reserve", "respond",
  "return", "review", "revise", "run", "scan", "schedule", "search", "sell",
  "send", "set", "share", "shop", "sign", "sort", "start", "stretch", "submit",
  "swap", "take", "talk", "tell", "test", "text", "throw", "track", "transfer",
  "try", "unsubscribe", "update", "upload", "visit", "wash", "watch", "water",
  "wire", "write",
]);

/** First word of the title, lowercased, stripped of emoji/punctuation. */
function firstWord(title: string): string {
  const words = title
    .toLowerCase()
    // Keep letters/digits/spaces only, so "📞 Call mom!" → "call mom"
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words[0] ?? "";
}

function wordCount(title: string): number {
  return title
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * True when a task title looks like a *topic* rather than a physical next
 * action — the "Mom" / "taxes" / "dentist appointment" shape. Used for
 * gentle, non-blocking nudges only.
 *
 * Flags: a single word, or a very short title (≤ 3 words) that doesn't
 * start with a recognizable action verb. Longer titles get the benefit of
 * the doubt — nagging on those costs more trust than it buys clarity.
 */
export function looksLikeTopic(title: string): boolean {
  const count = wordCount(title);
  if (count === 0) return false; // nothing typed yet — don't nag an empty field
  const verb = ACTION_VERBS.has(firstWord(title));
  if (count === 1) return !verb; // "Mom", "taxes" — but a bare "Stretch" is fine
  if (count <= 3) return !verb; // "dentist appointment", "tax stuff 2026"
  return false;
}

/** The nudge copy, shared so Clarify and the Weekly Review say the same thing. */
export const TOPIC_NUDGE =
  "Looks like a topic, not an action — what would someone literally see you doing? Start with a verb.";
