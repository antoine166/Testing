// GTD: every active project must always have a next action. Shared by
// Coach's Weekly Review (lib/coach/shared.ts) and the Projects/Domains
// pages, so "stalled" means the same thing whether it's caught by a weekly
// sweep or flagged the moment it happens — one predicate, not two that can
// drift apart.

export type StalledProjectInput = { id: string; status: string; parent_project_id: string | null };
export type StalledTaskInput = { project_id: string | null; status: string };

/**
 * IDs of active projects with zero open tasks, counting a subproject's open
 * tasks toward its parent — a parent with an active subproject that has a
 * next action isn't actually stalled.
 */
export function findStalledProjectIds(
  projects: StalledProjectInput[],
  tasks: StalledTaskInput[],
): Set<string> {
  const openTaskCountByProject = new Map<string, number>();
  for (const t of tasks) {
    if (t.status === "done" || !t.project_id) continue;
    openTaskCountByProject.set(t.project_id, (openTaskCountByProject.get(t.project_id) ?? 0) + 1);
  }

  const subprojectsByParent = new Map<string, StalledProjectInput[]>();
  for (const p of projects) {
    if (!p.parent_project_id) continue;
    if (!subprojectsByParent.has(p.parent_project_id)) subprojectsByParent.set(p.parent_project_id, []);
    subprojectsByParent.get(p.parent_project_id)!.push(p);
  }

  const stalled = new Set<string>();
  for (const p of projects) {
    if (p.status !== "active") continue;
    const ownCount = openTaskCountByProject.get(p.id) ?? 0;
    const childCount = (subprojectsByParent.get(p.id) ?? []).reduce(
      (sum, child) => sum + (openTaskCountByProject.get(child.id) ?? 0),
      0,
    );
    if (!ownCount && !childCount) stalled.add(p.id);
  }
  return stalled;
}
