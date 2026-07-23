// The "Context space" on a task is three structured dimensions — GTD's
// limiting criteria — instead of one free-text field:
//   - Time available (how long the action takes)
//   - Energy required (low / medium / high, on tasks.energy_level)
//   - Location (where/with-what — tasks.context, chosen from the editable
//     `contexts` list; seeded with these five)
//
// Time is still STORED as an integer in tasks.estimated_minutes (the
// Calendar sizes blocks from it, Do Now filters on it) — the dropdown just
// offers coarse buckets that map to a representative minute value, so no
// other surface has to change.

export const TIME_BUCKETS: { label: string; value: string }[] = [
  { label: "0–15 min", value: "15" },
  { label: "15–30 min", value: "30" },
  { label: "30–60 min", value: "60" },
  { label: "60+ min", value: "90" },
];

/** Map a stored estimate (any int) back to its bucket value for the dropdown. */
export function minutesToBucketValue(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return "";
  if (minutes <= 15) return "15";
  if (minutes <= 30) return "30";
  if (minutes <= 60) return "60";
  return "90";
}

/** The five locations the contexts list is seeded with — also the fallback
 *  options if the live list can't be fetched, so the dropdown is never empty. */
export const DEFAULT_LOCATIONS = ["Computer", "Home", "Gym", "Phone", "Errands"] as const;
