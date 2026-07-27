/**
 * Single source of truth for task field values. These were previously
 * declared independently in eight files (pages, components, API routes,
 * and the MCP connector) — one drifting copy would mean the app and
 * Claude disagreeing about what a valid priority is.
 *
 * Kept as `as const` tuples (not plain arrays) so zod's `z.enum()` in the
 * MCP connector can consume them directly.
 */
export const STATUSES = ["todo", "in_progress", "done"] as const;
export const PRIORITIES = ["none", "low", "medium", "high"] as const;
export const ENERGY_LEVELS = ["low", "medium", "high"] as const;

export type TaskStatus = (typeof STATUSES)[number];
export type TaskPriority = (typeof PRIORITIES)[number];
export type TaskEnergy = (typeof ENERGY_LEVELS)[number];
