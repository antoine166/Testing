// A tiny physical "tick" at the moment of completion — only fires in the
// installed PWA on devices that support the Vibration API (Android/Chrome;
// iOS Safari ignores it, degrading to nothing). Kept deliberately short so
// it reads as a confirmation tap, not a buzz.
export function tapHaptic(durationMs = 15): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(durationMs);
  }
}
