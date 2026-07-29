/**
 * Motion pass (#141): components that hold a brief "closing"/"leaving"
 * state so an exit animation can play before unmount check this first —
 * under reduced motion the CSS animations are all no-ops, so the state
 * change should be instant instead of idling for the animation window.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );
}
