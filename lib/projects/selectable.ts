/**
 * Which projects a task picker should offer. Completed projects are
 * finished work — they take no new tasks, so they disappear from filing
 * dropdowns. `keepId` (the task's current project when editing) stays
 * listed even if completed, so opening an old task never blanks its
 * project or silently re-files it on save.
 */
export function selectableProjects<P extends { id: string; status?: string }>(
  projects: P[],
  keepId?: string | null,
): P[] {
  return projects.filter((p) => p.status !== "completed" || p.id === keepId);
}
