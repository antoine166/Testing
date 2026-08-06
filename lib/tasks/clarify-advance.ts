// Decides whether the Clarify flow should skip past the current queue entry
// because its task no longer exists in the live task list.
//
// The task disappearing means one of two very different things:
//  - processed elsewhere (another tab, Claude via MCP) while the flow was
//    open → skip ahead to the next item;
//  - removed by the flow's OWN optimistic mutation (trash, convert to
//    project/reference, a completed 2-minute item) → do NOT skip: the
//    in-flight action's own advance() moves the flow when it finishes, and
//    the post-convert "project" panel deliberately outlives its (now
//    removed) task while the very next action is captured.
//
// Conflating the two hijacked the flow mid-conversion: the next inbox
// item's card mounted underneath the "Project created — what's the next
// action?" panel, making that item look like it belonged to the new
// project, and "Add & next" then advanced a second time, silently skipping
// it.
export function shouldAutoAdvance(args: {
  /** The queue index still points at an entry. */
  hasCurrentEntry: boolean;
  /** The live task lookup found the current entry's task. */
  taskInList: boolean;
  /** One of the flow's own actions is mid-flight (busy or card animating out). */
  actionInFlight: boolean;
  /** The post-convert "project" panel is up, capturing the next action. */
  awaitingNextAction: boolean;
}): boolean {
  return (
    args.hasCurrentEntry &&
    !args.taskInList &&
    !args.actionInFlight &&
    !args.awaitingNextAction
  );
}
