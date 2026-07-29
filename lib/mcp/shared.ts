import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { TrashType } from "@/lib/trash";

export type AdminClient = ReturnType<typeof createAdminClient>;

// Domain restore stays app-only alongside domain deletion — the rest of the
// trash types are safe to recover from here.
export const RESTORABLE_TRASH_TYPES = [
  "project",
  "task",
  "habit",
  "workout",
  "routine",
  "checklist",
  "knowledge-item",
  "tickler-item",
  "person",
] as const satisfies readonly TrashType[];

export {
  ENERGY_LEVELS as TASK_ENERGY_LEVELS,
  PRIORITIES as TASK_PRIORITIES,
  STATUSES as TASK_STATUSES,
} from "@/lib/tasks/constants";
export const HABIT_FREQUENCIES = ["daily", "specific_days", "times_per_week"] as const;
export const PROJECT_STATUSES = ["active", "someday", "completed", "archived"] as const;
export const TIME_OF_DAY = ["morning", "afternoon", "evening", "custom"] as const;
export const KNOWLEDGE_TYPES = ["note", "article", "book", "quote", "resource"] as const;

// Storage buckets for image attachments — same names the app routes use
// (app/api/tasks/[id]/attachments, app/api/workout-logs/[id]/attachments).
export const TASK_ATTACHMENTS_BUCKET = "task-attachments";
export const WORKOUT_LOG_ATTACHMENTS_BUCKET = "workout-log-attachments";
export const SIGNED_URL_TTL_SECONDS = 3600;

export function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/**
 * "Today" for MCP tools. The connector runs server-side in UTC, so
 * todayLocal() there is UTC's day — wrong for Antoine every evening
 * (#112 item 4's known gap). Until requests carry a timezone, use his
 * home timezone (overridable via HOME_TIMEZONE without a deploy).
 */
import { todayInZone } from "@/lib/date";

export function todayHome(): string {
  return todayInZone(process.env.HOME_TIMEZONE ?? "America/New_York");
}
