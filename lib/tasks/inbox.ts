/**
 * The single definition of "in the Inbox," shared by every surface that
 * lists or counts it: the Inbox page, the Tasks page's Inbox section, the
 * sidebar badge, Analytics, the Weekly Review, and the MCP review snapshot.
 *
 * These each used to re-implement the filter, and they drifted — the Tasks
 * page listed Someday items that the Inbox page correctly hid, and the
 * sidebar badge counted delegated tasks the list left out. One predicate
 * means a disagreement between two surfaces is no longer possible.
 */

export type InboxCandidate = {
  domain_id: string | null;
  someday: boolean;
  waiting_for: boolean;
  status: string;
  // Optional because several callers' task types don't always select it; a
  // missing date reads the same as an unset one (no revisit scheduled).
  revisit_date?: string | null;
};

/**
 * GTD's tickler file: a Someday/Maybe item whose revisit date has arrived is
 * being handed back for a fresh decision. Drives both the Inbox's Someday
 * exception below and the "ready to revisit" nudge on Today, so the two
 * always agree about which items have come due. Callers filter out done
 * tasks themselves — this answers only "has its date arrived."
 */
export function isRevisitDue(
  task: Pick<InboxCandidate, "someday" | "revisit_date">,
  today: string,
): boolean {
  return task.someday && task.revisit_date != null && task.revisit_date <= today;
}

/**
 * Unprocessed and awaiting a decision: not yet filed under a domain, not
 * delegated (once it's Waiting For it lives on that list instead), not done.
 *
 * Someday/Maybe items are deliberately deferred, so they stay out of the
 * Inbox rather than cluttering it — until their revisit date arrives, at
 * which point the tickler file returns them for reconsideration.
 */
export function isInInbox(task: InboxCandidate, today: string): boolean {
  if (task.domain_id) return false;
  if (task.waiting_for) return false;
  if (task.status === "done") return false;
  if (task.someday) return isRevisitDue(task, today);
  return true;
}
