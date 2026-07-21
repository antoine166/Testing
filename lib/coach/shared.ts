import type { ContentBlockParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRASH_CONFIG, TRASH_TYPES, type TrashType } from "@/lib/trash";
import {
  generateNextCompletionOccurrence,
  seedCompletionTemplate,
  topUpTemplate,
  type StoredTemplate,
} from "@/lib/recurring-tasks/topup";
import { parseEnds, parseRecurrencePattern } from "@/lib/recurring-tasks/validate";
import { describeRecurrence } from "@/lib/recurring-tasks/types";
import { findStalledProjectIds } from "@/lib/projects/stalled";

// Domain restore stays app-only alongside domain deletion.
const COACH_RESTORABLE_TRASH_TYPES = [
  "project",
  "task",
  "habit",
  "workout",
  "routine",
  "checklist",
  "knowledge-item",
  "tickler-item",
] as const satisfies readonly TrashType[];

export const MODEL = "claude-sonnet-5";

export const TOOLS: Tool[] = [
  {
    name: "create_task",
    description:
      "Create a new task for Antoine. Use this when he mentions something he needs to do " +
      "(e.g. 'remind me to call the dentist'). Leave domain_id unset to put it in the Inbox.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The task title" },
        link: { type: "string", description: "Optional related URL." },
        context: {
          type: "string",
          description: "Optional GTD context tag like 'calls', 'errands', 'computer' — free text, no @ prefix.",
        },
        domain_id: {
          type: "string",
          description: "Optional domain UUID from the context below. Omit to leave in Inbox.",
        },
        priority: { type: "string", enum: ["none", "low", "medium", "high"] },
        due_date: { type: "string", description: "Optional, format YYYY-MM-DD" },
        scheduled_date: { type: "string", description: "Optional, format YYYY-MM-DD" },
        scheduled_time: {
          type: "string",
          description:
            "Optional, format HH:MM, only meaningful alongside scheduled_date. Only set this if " +
            "it's a genuine appointment that must happen at that time (GTD's hard landscape) — a " +
            "scheduled_date alone just means 'planned for that day,' not a commitment. Don't set a " +
            "time just because a date was given.",
        },
        someday: {
          type: "boolean",
          description: "Optional. Things-style Someday/Maybe — deliberately deferred rather than active now.",
        },
        waiting_for: {
          type: "boolean",
          description: "Optional. GTD Waiting For — delegated/blocked on someone else. Starts the days-waiting clock.",
        },
        waiting_on: {
          type: "string",
          description: "Optional, only meaningful when waiting_for is true. Who it's delegated to/blocked on.",
        },
        estimated_minutes: {
          type: "number",
          description: "Optional. GTD's 'time available' criterion — rough estimate of how long this takes.",
        },
        energy_required: {
          type: "string",
          enum: ["low", "medium", "high"],
          description:
            "Optional. GTD's 'resources available' criterion — how much energy this realistically " +
            "takes. Distinct from save_checkin's energy_level, which is Antoine's own daily capacity.",
        },
        revisit_date: {
          type: "string",
          description:
            "Optional, only meaningful when someday is true. GTD tickler file: a date (YYYY-MM-DD) " +
            "this Someday/Maybe item should resurface for reconsideration.",
        },
        follow_up_date: {
          type: "string",
          description:
            "Optional, only meaningful when waiting_for is true. A date (YYYY-MM-DD) to actively " +
            "prompt a follow-up nudge, instead of only tracking passive days-elapsed.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "save_checkin",
    description:
      "Record Antoine's daily capacity check-in — energy and focus level (1-5 each). One entry " +
      "per day; saving again overwrites that day's entry.",
    input_schema: {
      type: "object",
      properties: {
        energy_level: { type: "number", description: "1-5" },
        focus_level: { type: "number", description: "1-5" },
        notes: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
      },
      required: ["energy_level", "focus_level"],
    },
  },
  {
    name: "create_habit",
    description: "Start tracking a new habit for Antoine.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        frequency: {
          type: "string",
          enum: ["daily", "specific_days", "times_per_week"],
          description: "Defaults to daily",
        },
        frequency_days: {
          type: "array",
          items: { type: "number" },
          description: "Days of week (0=Sunday) — only for frequency: specific_days",
        },
        target_count: { type: "number", description: "Times per week — only for frequency: times_per_week" },
        icon: { type: "string" },
        domain_id: {
          type: "string",
          description:
            "Habits are colored by their domain in the UI — file it under a domain rather than " +
            "setting a color directly.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "update_habit",
    description: "Update an existing habit's name, schedule, icon, domain, or active state.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string", description: "The habit's UUID from the context below" },
        name: { type: "string" },
        frequency: { type: "string", enum: ["daily", "specific_days", "times_per_week"] },
        frequency_days: { type: "array", items: { type: "number" }, description: "Empty array clears it" },
        target_count: { type: "number" },
        icon: { type: "string" },
        active: { type: "boolean" },
        domain_id: { type: "string", description: "Empty string clears it" },
      },
      required: ["habit_id"],
    },
  },
  {
    name: "delete_habit",
    description: "Move a habit (and its log history) to Trash, referenced by its UUID. Recoverable for 30 days.",
    input_schema: {
      type: "object",
      properties: { habit_id: { type: "string" } },
      required: ["habit_id"],
    },
  },
  {
    name: "log_habit",
    description:
      "Log that Antoine completed a habit today. Use this when he mentions doing a habit " +
      "(e.g. 'I meditated this morning', 'did my workout'). Match against the habit list below. " +
      "Can be called again for the same habit for 'extra credit' if he says he did it more than " +
      "once today (e.g. two workouts) — capped at 7 times a day.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string", description: "The habit's UUID from the context below" },
      },
      required: ["habit_id"],
    },
  },
  {
    name: "unlog_habit",
    description:
      "Undo today's habit log, e.g. if Antoine says he didn't actually do it or logged it by " +
      "mistake. If it was logged more than once today (extra credit), this removes just the " +
      "most recently added one, not all of them.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string", description: "The habit's UUID from the context below" },
      },
      required: ["habit_id"],
    },
  },
  {
    name: "create_workout",
    description: "Add a new named workout to Antoine's Training Log catalog (e.g. \"Leg Day\").",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        icon: { type: "string" },
        weekly_target: {
          type: "number",
          description: "Times per week he's aiming for this workout. Omit for no goal.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "update_workout",
    description:
      "Rename or update an existing workout in the Training Log catalog, including its weekly " +
      "goal — adjust this as his training progresses (e.g. he says 'bump GPP Lift to twice a week').",
    input_schema: {
      type: "object",
      properties: {
        workout_id: { type: "string", description: "The workout's UUID from the context below" },
        name: { type: "string" },
        icon: { type: "string" },
        weekly_target: {
          type: "number",
          description: "Times per week he's aiming for. Pass 0 to clear the goal.",
        },
      },
      required: ["workout_id"],
    },
  },
  {
    name: "delete_workout",
    description: "Move a workout (and its log history) to Trash, referenced by its UUID. Recoverable for 30 days.",
    input_schema: {
      type: "object",
      properties: { workout_id: { type: "string" } },
      required: ["workout_id"],
    },
  },
  {
    name: "log_workout",
    description:
      "Log that Antoine did a specific workout from his Training Log catalog today (e.g. " +
      "'I did GPP Lift'). Match against the workout catalog below. Optional duration in minutes " +
      "and notes. Can be called again for the same workout today for a second session (e.g. AM/PM).",
    input_schema: {
      type: "object",
      properties: {
        workout_id: { type: "string", description: "The workout's UUID from the context below" },
        duration_minutes: { type: "number" },
        notes: { type: "string" },
      },
      required: ["workout_id"],
    },
  },
  {
    name: "unlog_workout",
    description:
      "Undo today's workout log entry, e.g. if Antoine says he didn't actually do it or logged " +
      "it by mistake. If it was logged more than once today, this removes just the most recently " +
      "added one, not all of them.",
    input_schema: {
      type: "object",
      properties: {
        workout_id: { type: "string", description: "The workout's UUID from the context below" },
      },
      required: ["workout_id"],
    },
  },
  {
    name: "update_task",
    description:
      "Update an existing task, referenced by its UUID from the context below. Use to mark it " +
      "done, reschedule it, clear a Waiting For (set waiting_for to false), move a Someday/Maybe " +
      "item back to active (set someday to false), or file it into a domain/project.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        status: { type: "string", enum: ["todo", "in_progress", "done"] },
        priority: { type: "string", enum: ["none", "low", "medium", "high"] },
        link: { type: "string", description: "Related URL. Empty string clears it." },
        context: {
          type: "string",
          description: "GTD context tag (free text, no @ prefix). Empty string clears it.",
        },
        due_date: { type: "string", description: "Empty string clears it" },
        scheduled_date: { type: "string", description: "Empty string clears it" },
        scheduled_time: {
          type: "string",
          description:
            "Format HH:MM. Empty string clears it. Only meaningful alongside scheduled_date. Only " +
            "set this if it's a genuine appointment (GTD's hard landscape) — don't set a time just " +
            "because a date was given.",
        },
        someday: { type: "boolean" },
        waiting_for: {
          type: "boolean",
          description: "Turning it off also clears waiting_on and follow_up_date.",
        },
        waiting_on: {
          type: "string",
          description:
            "Who it's delegated to/blocked on. Empty string clears it. Only meaningful when waiting_for is true.",
        },
        domain_id: { type: "string", description: "Empty string clears it" },
        project_id: { type: "string", description: "Empty string clears it" },
        estimated_minutes: { type: "number", description: "Empty/0 clears it" },
        energy_required: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Empty string clears it. Distinct from save_checkin's energy_level.",
        },
        revisit_date: {
          type: "string",
          description: "GTD tickler file date. Empty string clears it. Only meaningful when someday is true.",
        },
        follow_up_date: {
          type: "string",
          description:
            "Date to actively prompt a follow-up nudge. Empty string clears it. Only meaningful " +
            "when waiting_for is true — automatically cleared if waiting_for is set to false.",
        },
      },
      required: ["task_id"],
    },
  },
  {
    name: "delete_task",
    description:
      "Move a task to Trash, referenced by its UUID. Only use when Antoine clearly wants it " +
      "removed, not just completed — completing should use update_task with status done instead. " +
      "If it's a generated occurrence of a recurring task and he wants to stop the series (not just " +
      "skip this one), pass scope: \"following\" to also trash every other not-yet-done occurrence " +
      "of the same series from this date onward, and pause the series so nothing regenerates to " +
      "replace them.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        scope: { type: "string", enum: ["single", "following"], description: "Defaults to single." },
      },
      required: ["task_id"],
    },
  },
  {
    name: "convert_task_to_project",
    description:
      "Turn a task into a project when it turns out to need multiple steps, not one action. " +
      "Creates a new project carrying over the task's title, notes, domain, priority, dates, and " +
      "link, then moves the original task to Trash (recoverable for 30 days).",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "convert_task_to_knowledge_item",
    description:
      "GTD's first Clarify fork: 'is it actionable?' Use when the answer is no — files a task as " +
      "reference instead of action. Creates a knowledge library item (type note) carrying over the " +
      "task's title, notes, and link, then moves the original task to Trash (recoverable for 30 " +
      "days). Deliberately no type/folder picker — one motion, refile it afterward if needed.",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "convert_task_to_recurring",
    description:
      "Turn an existing plain task into the seed of a new recurring task template, carrying over " +
      "its title, notes, domain, project, priority, and link. Generates the new series' first " +
      "occurrence(s), then moves the original task to Trash (recoverable for 30 days) — the new " +
      "series' first occurrence stands in for it. Fails if the task is already part of a series. " +
      "Same recurrence_type / pattern-field rules as create_recurring_task.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        recurrence_type: {
          type: "string",
          enum: ["weekly", "monthly", "monthly_nth_weekday", "yearly", "interval", "completion"],
        },
        days_of_week: { type: "array", items: { type: "number" } },
        day_of_month: { type: "number" },
        interval_days: { type: "number" },
        month_of_year: { type: "number" },
        week_of_month: { type: "number" },
        weekday_of_month: { type: "number" },
        month_clamp: { type: "string", enum: ["clamp", "roll"] },
        completion_offset_count: { type: "number" },
        completion_offset_unit: { type: "string", enum: ["day", "week", "month", "year"] },
        ends_type: { type: "string", enum: ["never", "date", "count"] },
        ends_date: { type: "string" },
        ends_count: { type: "number" },
      },
      required: ["task_id", "recurrence_type"],
    },
  },
  {
    name: "update_project",
    description:
      "Update a project's status, domain, or parent project, referenced by its UUID from the " +
      "context below. Use to archive a completed project, mark one someday, reactivate a " +
      "someday project, or file it as a subproject of another project (parent_project_id). " +
      "Subprojects can only be one level deep and always take on their parent's domain.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        status: { type: "string", enum: ["active", "someday", "completed", "archived"] },
        priority: { type: "string", enum: ["none", "low", "medium", "high"] },
        due_date: { type: "string", description: "Empty string clears it" },
        scheduled_date: { type: "string", description: "Empty string clears it" },
        link: { type: "string", description: "Related URL. Empty string clears it." },
        domain_id: { type: "string" },
        parent_project_id: {
          type: "string",
          description:
            "UUID of another top-level project to nest this one under. Empty string clears it, " +
            "promoting it back to top-level.",
        },
        purpose: {
          type: "string",
          description: "GTD Natural Planning Model — why this project matters. Empty string clears it.",
        },
        outcome_vision: {
          type: "string",
          description: "GTD Natural Planning Model — what \"done\" looks like. Empty string clears it.",
        },
        brainstorm: {
          type: "string",
          description:
            "GTD Natural Planning Model — ideas, approaches, things to consider. Empty string clears it.",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "create_project",
    description:
      "Create a new project when a next action implies a multi-step outcome that isn't tracked " +
      "yet (an 'embedded project'). Set parent_project_id to create it as a subproject of an " +
      "existing top-level project instead (e.g. 'packing' under 'Move to Atlanta') — it then " +
      "inherits that project's domain automatically. Subprojects can only be one level deep.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        domain_id: { type: "string" },
        parent_project_id: {
          type: "string",
          description: "UUID of a top-level project to nest this new project under, if any.",
        },
        description: { type: "string" },
        purpose: {
          type: "string",
          description: "GTD Natural Planning Model — why this project matters, if worth capturing upfront.",
        },
        outcome_vision: {
          type: "string",
          description: "GTD Natural Planning Model — what \"done\" looks like, if worth capturing upfront.",
        },
        brainstorm: {
          type: "string",
          description:
            "GTD Natural Planning Model — ideas, approaches, things to consider, if worth capturing upfront.",
        },
        priority: { type: "string", enum: ["none", "low", "medium", "high"] },
        due_date: { type: "string", description: "Optional, format YYYY-MM-DD" },
        scheduled_date: { type: "string", description: "Optional, format YYYY-MM-DD" },
        link: { type: "string", description: "Optional related URL." },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_project",
    description:
      "Move a project to Trash, referenced by its UUID from the context below — its subprojects " +
      "(if any) and all of their tasks go with it. Recoverable for 30 days from the app's Trash " +
      "page.",
    input_schema: {
      type: "object",
      properties: { project_id: { type: "string" } },
      required: ["project_id"],
    },
  },
  {
    name: "create_domain",
    description: "Create a new top-level life domain (e.g. Health, Finance, Business).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        color: { type: "string", description: "Optional hex color, e.g. #3b82f6" },
        icon: { type: "string", description: "Optional emoji or icon name" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_domain",
    description: "Rename or recolor an existing domain, referenced by its UUID from the context below.",
    input_schema: {
      type: "object",
      properties: {
        domain_id: { type: "string" },
        name: { type: "string" },
        color: { type: "string", description: "Hex color, e.g. #3b82f6" },
        icon: { type: "string" },
      },
      required: ["domain_id"],
    },
  },
  {
    name: "create_context",
    description:
      "Save a new GTD context (e.g. 'Errands', 'Deep Work') so it's suggested on tasks before " +
      "anything uses it. tasks.context itself stays free text — this only feeds the suggestion list.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "update_context",
    description: "Rename a saved context, referenced by its UUID from the context below.",
    input_schema: {
      type: "object",
      properties: { context_id: { type: "string" }, name: { type: "string" } },
      required: ["context_id", "name"],
    },
  },
  {
    name: "delete_context",
    description:
      "Permanently delete a saved context, referenced by its UUID. Doesn't touch any task already " +
      "using that context string — it just stops being suggested.",
    input_schema: {
      type: "object",
      properties: { context_id: { type: "string" } },
      required: ["context_id"],
    },
  },
  {
    name: "create_routine",
    description:
      "Create a new routine — an ordered sequence of steps tied to a time of day, surfaced on " +
      "the Today view.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        time_of_day: { type: "string", enum: ["morning", "afternoon", "evening", "custom"] },
      },
      required: ["name"],
    },
  },
  {
    name: "update_routine",
    description:
      "Rename a routine, change its time of day, or pause it, referenced by its UUID from the " +
      "context below.",
    input_schema: {
      type: "object",
      properties: {
        routine_id: { type: "string" },
        name: { type: "string" },
        time_of_day: { type: "string", enum: ["morning", "afternoon", "evening", "custom"] },
        active: { type: "boolean", description: "Set false to pause it" },
      },
      required: ["routine_id"],
    },
  },
  {
    name: "delete_routine",
    description:
      "Move a routine (and its steps) to Trash, referenced by its UUID from the context below. " +
      "Recoverable for 30 days.",
    input_schema: {
      type: "object",
      properties: { routine_id: { type: "string" } },
      required: ["routine_id"],
    },
  },
  {
    name: "list_routine_items",
    description:
      "List the ordered steps of a routine, referenced by its UUID from the context below — call " +
      "this before updating or deleting a specific step, since individual steps aren't listed in " +
      "the context, only the routine itself.",
    input_schema: {
      type: "object",
      properties: { routine_id: { type: "string" } },
      required: ["routine_id"],
    },
  },
  {
    name: "add_routine_item",
    description: "Append a new step to the end of an existing routine.",
    input_schema: {
      type: "object",
      properties: {
        routine_id: { type: "string", description: "The routine's UUID from the context below" },
        title: { type: "string" },
        duration_minutes: { type: "number" },
      },
      required: ["routine_id", "title"],
    },
  },
  {
    name: "update_routine_item",
    description: "Update a routine step's title, duration, or order, referenced by its UUID from the context below.",
    input_schema: {
      type: "object",
      properties: {
        routine_item_id: { type: "string" },
        title: { type: "string" },
        duration_minutes: { type: "number", description: "0 clears it" },
        sort_order: { type: "number" },
      },
      required: ["routine_item_id"],
    },
  },
  {
    name: "delete_routine_item",
    description:
      "Remove a single step from a routine, referenced by its UUID. Not recoverable — routine " +
      "steps aren't trashed individually.",
    input_schema: {
      type: "object",
      properties: { routine_item_id: { type: "string" } },
      required: ["routine_item_id"],
    },
  },
  {
    name: "list_checklist_items",
    description:
      "List the items on a checklist, in order, with their checked state, referenced by its UUID " +
      "from the context below — call this before updating or deleting a specific item, since " +
      "individual items aren't listed in the context, only the checklist itself.",
    input_schema: {
      type: "object",
      properties: { checklist_id: { type: "string" } },
      required: ["checklist_id"],
    },
  },
  {
    name: "create_checklist",
    description: "Create a new empty checklist (a reusable, resettable list — e.g. a packing list).",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "update_checklist",
    description: "Rename a checklist, referenced by its UUID from the context below.",
    input_schema: {
      type: "object",
      properties: { checklist_id: { type: "string" }, name: { type: "string" } },
      required: ["checklist_id", "name"],
    },
  },
  {
    name: "delete_checklist",
    description:
      "Move a checklist (and its items) to Trash, referenced by its UUID from the context below. " +
      "Recoverable for 30 days.",
    input_schema: {
      type: "object",
      properties: { checklist_id: { type: "string" } },
      required: ["checklist_id"],
    },
  },
  {
    name: "reset_checklist",
    description: "Uncheck every item on a checklist in one action, so it's ready to reuse.",
    input_schema: {
      type: "object",
      properties: { checklist_id: { type: "string" } },
      required: ["checklist_id"],
    },
  },
  {
    name: "add_checklist_item",
    description: "Append a new item to the end of an existing checklist.",
    input_schema: {
      type: "object",
      properties: {
        checklist_id: { type: "string", description: "The checklist's UUID from the context below" },
        title: { type: "string" },
      },
      required: ["checklist_id", "title"],
    },
  },
  {
    name: "update_checklist_item",
    description: "Check/uncheck a checklist item, rename it, or change its order, referenced by its UUID.",
    input_schema: {
      type: "object",
      properties: {
        checklist_item_id: { type: "string" },
        title: { type: "string" },
        checked: { type: "boolean" },
        sort_order: { type: "number" },
      },
      required: ["checklist_item_id"],
    },
  },
  {
    name: "delete_checklist_item",
    description:
      "Remove a single item from a checklist, referenced by its UUID. Not recoverable — checklist " +
      "items aren't trashed individually.",
    input_schema: {
      type: "object",
      properties: { checklist_item_id: { type: "string" } },
      required: ["checklist_item_id"],
    },
  },
  {
    name: "create_tickler_item",
    description:
      "Create a GTD tickler-file note (the 43-folders concept) — a bare \"show me this again on " +
      "X date\" reminder for something that isn't a task yet, with nothing actionable to track " +
      "until then (e.g. 'don't think about this until March'). Distinct from a Someday/Maybe " +
      "task's revisit_date, which applies to an already-existing task. If it's already " +
      "actionable, use create_task instead.",
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string" },
        revisit_date: { type: "string", description: "YYYY-MM-DD — the date this should resurface." },
      },
      required: ["note", "revisit_date"],
    },
  },
  {
    name: "update_tickler_item",
    description: "Update a tickler item's note or revisit date, referenced by its UUID from the context below.",
    input_schema: {
      type: "object",
      properties: {
        tickler_item_id: { type: "string" },
        note: { type: "string" },
        revisit_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["tickler_item_id"],
    },
  },
  {
    name: "delete_tickler_item",
    description: "Move a tickler item to Trash, referenced by its UUID from the context below. Recoverable for 30 days.",
    input_schema: {
      type: "object",
      properties: { tickler_item_id: { type: "string" } },
      required: ["tickler_item_id"],
    },
  },
  {
    name: "convert_tickler_item_to_task",
    description:
      "The tickler item's date arrived and it turns out to be actionable now: creates a real " +
      "task from its note (lands in Inbox) and trashes the tickler item.",
    input_schema: {
      type: "object",
      properties: { tickler_item_id: { type: "string" } },
      required: ["tickler_item_id"],
    },
  },
  {
    name: "list_knowledge_items",
    description:
      "List Antoine's saved notes, articles, books, quotes, and resources — call this before " +
      "updating or deleting a specific item, since individual items aren't listed in the context, " +
      "only the folders are. Optionally filter by type, folder, or tag.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["note", "article", "book", "quote", "resource"] },
        folder_id: { type: "string", description: "Optional folder UUID from the context below" },
        tag: { type: "string", description: "Only return items with this tag" },
      },
    },
  },
  {
    name: "create_knowledge_item",
    description:
      "Save a new note, article, book, quote, or resource to Antoine's knowledge library. Use " +
      "this when he mentions something worth keeping (e.g. a book recommendation, a link).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        url: { type: "string" },
        type: { type: "string", enum: ["note", "article", "book", "quote", "resource"] },
        tags: { type: "array", items: { type: "string" } },
        folder_id: { type: "string", description: "Optional folder UUID from the context below" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_knowledge_item",
    description: "Update an existing knowledge library item, referenced by its UUID from the context below.",
    input_schema: {
      type: "object",
      properties: {
        knowledge_item_id: { type: "string" },
        title: { type: "string" },
        content: { type: "string" },
        url: { type: "string", description: "Empty string clears it" },
        type: { type: "string", enum: ["note", "article", "book", "quote", "resource"] },
        tags: { type: "array", items: { type: "string" }, description: "Empty array clears it" },
        folder_id: { type: "string", description: "Empty string clears it (moves to top level)" },
      },
      required: ["knowledge_item_id"],
    },
  },
  {
    name: "delete_knowledge_item",
    description: "Move a knowledge library item to Trash, referenced by its UUID. Recoverable for 30 days.",
    input_schema: {
      type: "object",
      properties: { knowledge_item_id: { type: "string" } },
      required: ["knowledge_item_id"],
    },
  },
  {
    name: "create_knowledge_folder",
    description: "Create a new knowledge library folder, optionally nested inside another.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        parent_id: { type: "string", description: "Optional parent folder UUID from the context below" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_knowledge_folder",
    description:
      "Rename a knowledge library folder or move it under a different parent, referenced by its " +
      "UUID from the context below.",
    input_schema: {
      type: "object",
      properties: {
        folder_id: { type: "string" },
        name: { type: "string" },
        parent_id: { type: "string", description: "Empty string clears it (moves to top level)" },
      },
      required: ["folder_id"],
    },
  },
  {
    name: "create_agenda_item",
    description:
      "Add a GTD agenda item — something to bring up with a specific person next time Antoine " +
      "talks to them (e.g. 'ask Sarah about the Q3 budget').",
    input_schema: {
      type: "object",
      properties: {
        person_name: { type: "string", description: "Who to bring it up with — free text." },
        note: { type: "string", description: "What to bring up." },
      },
      required: ["person_name", "note"],
    },
  },
  {
    name: "update_agenda_item",
    description:
      "Update an agenda item, referenced by its UUID from the context below. Use to mark it done " +
      "once it's been discussed, or edit the person/note.",
    input_schema: {
      type: "object",
      properties: {
        agenda_item_id: { type: "string" },
        person_name: { type: "string" },
        note: { type: "string" },
        done: { type: "boolean" },
      },
      required: ["agenda_item_id"],
    },
  },
  {
    name: "delete_agenda_item",
    description:
      "Permanently delete an agenda item, referenced by its UUID. These aren't in the Trash system, " +
      "so this can't be undone — only use it when Antoine clearly wants it gone.",
    input_schema: {
      type: "object",
      properties: { agenda_item_id: { type: "string" } },
      required: ["agenda_item_id"],
    },
  },
  {
    name: "update_horizons",
    description:
      "Update Antoine's GTD higher horizons — goals & objectives (1-2 yr), vision (3-5 yr), and/or " +
      "purpose & principles. Only the fields you pass change; omitted ones keep their current value.",
    input_schema: {
      type: "object",
      properties: {
        goals: { type: "string" },
        vision: { type: "string" },
        purpose: { type: "string" },
      },
    },
  },
  {
    name: "list_trash",
    description:
      "List items currently in Trash — soft-deleted and recoverable for 30 days. Call this when " +
      "Antoine wants to restore something from an earlier session (if it was deleted earlier in " +
      "this conversation, you already have its id from that tool call). Trashed domains appear for " +
      "reference, but restoring one stays app-only.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "restore_from_trash",
    description:
      "Restore a soft-deleted item from Trash — e.g. when Antoine says 'undo that' or 'restore the " +
      "task I just deleted' (use the same id you passed to the delete tool earlier in this " +
      "conversation). Works for tasks, projects, habits, routines, checklists, and knowledge items. " +
      "Restoring a domain, and permanently purging anything, stay app-only.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["project", "task", "habit", "routine", "checklist", "knowledge-item"],
        },
        id: { type: "string" },
      },
      required: ["type", "id"],
    },
  },
  {
    name: "create_recurring_task",
    description:
      "Create a recurring task template (e.g. 'submit the BSL accountability tracker every " +
      "Monday', or 'change the oil 3 months after I last did it'). For every recurrence_type except " +
      "completion, generates the first batch of occurrences immediately, up to horizon_count; " +
      "completion generates a single starting occurrence instead. The fields required alongside " +
      "recurrence_type vary: weekly needs days_of_week; monthly needs day_of_month (+ optional " +
      "month_clamp); monthly_nth_weekday needs week_of_month + weekday_of_month; yearly needs " +
      "month_of_year + day_of_month (+ optional month_clamp); interval needs interval_days; " +
      "completion needs completion_offset_count + completion_offset_unit.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        notes: { type: "string" },
        link: { type: "string" },
        domain_id: { type: "string" },
        project_id: { type: "string" },
        priority: { type: "string", enum: ["none", "low", "medium", "high"] },
        recurrence_type: {
          type: "string",
          enum: ["weekly", "monthly", "monthly_nth_weekday", "yearly", "interval", "completion"],
          description:
            "completion generates the next occurrence only once the current one is marked done, " +
            "offset from the completion date, instead of on a fixed schedule.",
        },
        days_of_week: {
          type: "array",
          items: { type: "number" },
          description: "Required for weekly: 0=Sun..6=Sat, one or more days.",
        },
        day_of_month: {
          type: "number",
          description: "Required for monthly and yearly: 1-31, subject to month_clamp in the target month.",
        },
        interval_days: {
          type: "number",
          description: "Required for interval: generate every N days, starting today.",
        },
        month_of_year: { type: "number", description: "Required for yearly: 1=Jan..12=Dec." },
        week_of_month: {
          type: "number",
          description: "Required for monthly_nth_weekday: 1-5 (1st..5th), or -1 for 'last'.",
        },
        weekday_of_month: {
          type: "number",
          description:
            "Required for monthly_nth_weekday: 0=Sun..6=Sat, e.g. week_of_month 2 + weekday_of_month 2 = '2nd Tuesday'.",
        },
        month_clamp: {
          type: "string",
          enum: ["clamp", "roll"],
          description:
            "Only for monthly/yearly, when day_of_month doesn't exist in the target month: 'clamp' " +
            "(default) generates on that month's last day; 'roll' generates on the 1st of the next month.",
        },
        completion_offset_count: { type: "number", description: "Required for completion." },
        completion_offset_unit: {
          type: "string",
          enum: ["day", "week", "month", "year"],
          description: "Required for completion.",
        },
        ends_type: {
          type: "string",
          enum: ["never", "date", "count"],
          description: "'never' (default), 'date' (requires ends_date), or 'count' (requires ends_count).",
        },
        ends_date: { type: "string", description: "Required when ends_type is 'date' (YYYY-MM-DD)." },
        ends_count: { type: "number", description: "Required when ends_type is 'count' — total occurrences, ever." },
        horizon_count: {
          type: "number",
          description: "How many future occurrences stay generated at once (ignored for completion). Defaults to 12.",
        },
      },
      required: ["title", "recurrence_type"],
    },
  },
  {
    name: "update_recurring_task",
    description:
      "Update a recurring task template, referenced by its UUID from the context below — edit its " +
      "details, pause/resume it (active), change its horizon or Ends condition, or change its " +
      "recurrence pattern (detaches not-yet-done occurrences already generated under the old pattern, " +
      "which become ordinary tasks, and immediately generates the first occurrence(s) of the new one).",
    input_schema: {
      type: "object",
      properties: {
        recurring_task_id: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
        link: { type: "string" },
        domain_id: { type: "string" },
        project_id: { type: "string" },
        priority: { type: "string", enum: ["none", "low", "medium", "high"] },
        active: { type: "boolean" },
        horizon_count: { type: "number" },
        recurrence_type: {
          type: "string",
          enum: ["weekly", "monthly", "monthly_nth_weekday", "yearly", "interval", "completion"],
        },
        days_of_week: { type: "array", items: { type: "number" } },
        day_of_month: { type: "number" },
        interval_days: { type: "number" },
        month_of_year: { type: "number" },
        week_of_month: { type: "number" },
        weekday_of_month: { type: "number" },
        month_clamp: { type: "string", enum: ["clamp", "roll"] },
        completion_offset_count: { type: "number" },
        completion_offset_unit: { type: "string", enum: ["day", "week", "month", "year"] },
        ends_type: { type: "string", enum: ["never", "date", "count"] },
        ends_date: { type: "string" },
        ends_count: { type: "number" },
      },
      required: ["recurring_task_id"],
    },
  },
  {
    name: "delete_recurring_task",
    description:
      "Permanently delete a recurring task template, referenced by its UUID. Stops future " +
      "generation; already-generated tasks stay as ordinary tasks. Not in the Trash system, so this " +
      "can't be undone — pausing (update_recurring_task with active: false) is reversible.",
    input_schema: {
      type: "object",
      properties: { recurring_task_id: { type: "string" } },
      required: ["recurring_task_id"],
    },
  },
  {
    name: "generate_recurring_tasks",
    description:
      "Top up every active recurring task template's pre-generated occurrences back up to its " +
      "horizon (no-op for completion-anchored templates, which generate one at a time on completion " +
      "instead). Safe to call any time — idempotent, a template with no deficit generates nothing. " +
      "Use if Antoine asks to generate recurring tasks now rather than waiting for the daily job.",
    input_schema: { type: "object", properties: {} },
  },
];

const BASE_SYSTEM =
  "You are Antoine's personal life coach inside his Life OS app, using the GTD (Getting Things " +
  "Done) methodology. You have read access to his domains, projects, tasks, habits, routines, " +
  "checklists, knowledge library folders, agenda items, higher horizons (goals/vision/purpose), " +
  "recurring task templates, and today's check-in, given below. Give specific, context-aware " +
  "coaching grounded in this data — never generic advice. Keep replies conversational and brief.\n\n" +
  "You can take actions via tools: create/update/delete tasks and projects (including " +
  "subprojects), create/update domains, create/update/delete saved contexts, save daily check-ins, create/update/delete/log/track " +
  "habits, create/update/delete routines and their individual steps (list_routine_items first if " +
  "you need an existing step's id), create/update/delete/reset checklists and their individual " +
  "items (list_checklist_items first if you need an existing item's id), save/update/delete/organize " +
  "knowledge library items (list_knowledge_items first if you need an existing item's id) and " +
  "folders, create/update/delete agenda items (things to bring up with a person), update his " +
  "higher horizons, create/update/delete recurring task templates (these generate ordinary tasks " +
  "ahead of time, bounded by a horizon — not created lazily on completion) and top them up on " +
  "demand, create/update/delete tickler-file items (a bare 'resurface on this date' note for " +
  "something that isn't a task yet — convert_tickler_item_to_task turns it into one once it's " +
  "actionable), and restore soft-deleted items from Trash. Every " +
  "tool call requires the user's explicit confirmation " +
  "before it runs — the app shows him exactly what you're proposing and he approves or declines " +
  "each one. So don't ask for confirmation in your own text, just call the tool when it's clearly " +
  "implied and let the app handle confirmation.\n\n" +
  "Deleting tasks/projects/habits/routines/checklists/knowledge-items/tickler-items sends them to " +
  "Trash (30-day recovery), and you can restore them with restore_from_trash. A few actions are " +
  "deliberately app-only and out of your reach: deleting a domain, deleting a knowledge-library " +
  "folder, permanently purging trashed items (bypassing the recovery window), and Gmail/account " +
  "settings.";

const WEEKLY_REVIEW_SYSTEM =
  BASE_SYSTEM +
  "\n\nAntoine just clicked \"Start Weekly Review.\" Guide him through GTD's Weekly Review, one " +
  "section at a time, using the extra context below (stalled projects, Waiting For, Someday/Maybe, " +
  "open agenda items):\n\n" +
  "GET CLEAR — ask if anything is on his mind that isn't captured yet; help him capture it as a " +
  "task.\n" +
  "GET CURRENT — walk through, one at a time: stalled projects (each needs a next action — help " +
  "add one, or archive/someday it), Waiting For (anything to follow up on or that's actually " +
  "done), Someday/Maybe (anything that should become active now), open agenda items (anything to " +
  "convert into a task).\n" +
  "GET CREATIVE — ask if any new projects or ideas have come up that aren't captured yet.\n\n" +
  "Go section by section — don't dump everything at once. Wait for his response before moving to " +
  "the next section. Keep it conversational, not a robotic checklist recitation.";

export function systemPrompt(mode: string, context: string): string {
  return (mode === "weekly-review" ? WEEKLY_REVIEW_SYSTEM : BASE_SYSTEM) + "\n\n" + context;
}

export function extractText(content: ContentBlockParam[]): string {
  return content
    .filter((block): block is { type: "text"; text: string } & typeof block => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export async function buildContext(supabase: SupabaseClient, today: string, mode: string) {
  const [
    domainsRes,
    projectsRes,
    tasksRes,
    habitsRes,
    checkinRes,
    routinesRes,
    checklistsRes,
    foldersRes,
    agendaRes,
    horizonsRes,
    recurringRes,
    ticklerRes,
    contextsRes,
    workoutsRes,
    workoutLogsRes,
  ] = await Promise.all([
    supabase.from("domains").select("id, name"),
    supabase
      .from("projects")
      .select("id, name, status, parent_project_id")
      .neq("status", "archived"),
    supabase
      .from("tasks")
      .select(
        "id, title, status, priority, due_date, scheduled_date, scheduled_time, someday, revisit_date, waiting_for, waiting_since, waiting_on, follow_up_date, domain_id, project_id",
      )
      .is("deleted_at", null),
    supabase.from("habits").select("id, name, frequency, active").eq("active", true),
    supabase
      .from("daily_checkins")
      .select("energy_level, focus_level, notes")
      .eq("date", today)
      .maybeSingle(),
    supabase.from("routines").select("id, name, time_of_day, active").is("deleted_at", null),
    supabase.from("checklists").select("id, name").is("deleted_at", null),
    supabase.from("knowledge_folders").select("id, name"),
    supabase.from("agenda_items").select("id, person_name, note, done").order("created_at"),
    supabase.from("horizons").select("goals, vision, purpose").maybeSingle(),
    supabase
      .from("recurring_task_templates")
      .select(
        "id, title, recurrence_type, days_of_week, day_of_month, interval_days, month_of_year, week_of_month, weekday_of_month, month_clamp, completion_offset_count, completion_offset_unit, ends_type, ends_date, ends_count, active",
      )
      .order("created_at"),
    supabase
      .from("tickler_items")
      .select("id, note, revisit_date")
      .is("deleted_at", null)
      .order("revisit_date"),
    supabase.from("contexts").select("id, name").order("name"),
    supabase
      .from("workouts")
      .select("id, name, weekly_target")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("workout_logs")
      .select("workout_id, logged_date, duration_minutes, notes, workouts(name)")
      .gte("logged_date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .order("logged_date", { ascending: false }),
  ]);

  const domains = domainsRes.data ?? [];
  const projects = projectsRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const habits = habitsRes.data ?? [];
  const checkin = checkinRes.data;
  const routines = routinesRes.data ?? [];
  const checklists = checklistsRes.data ?? [];
  const knowledgeFolders = foldersRes.data ?? [];
  const agendaItems = agendaRes.data ?? [];
  const horizons = horizonsRes.data;
  const recurringTemplates = recurringRes.data ?? [];
  const ticklerItems = ticklerRes.data ?? [];
  const contexts = contextsRes.data ?? [];
  const workouts = workoutsRes.data ?? [];
  const workoutLogs = workoutLogsRes.data ?? [];
  const openTasks = tasks.filter((t) => t.status !== "done");
  const openAgendaItems = agendaItems.filter((a) => !a.done);

  const lines: string[] = [];
  lines.push(`Today's date: ${today}`);

  lines.push("\nDomains:");
  lines.push(domains.length ? domains.map((d) => `- ${d.id} ${d.name}`).join("\n") : "(none yet)");

  lines.push("\nSaved contexts (suggestions for a task's free-text context field):");
  lines.push(contexts.length ? contexts.map((c) => `- ${c.id} ${c.name}`).join(", ") : "(none yet)");

  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  lines.push("\nActive projects:");
  lines.push(
    projects.length
      ? projects
          .map(
            (p) =>
              `- ${p.id} ${p.name} (${p.status}${
                p.parent_project_id
                  ? `, subproject of ${projectNameById.get(p.parent_project_id) ?? p.parent_project_id}`
                  : ""
              })`,
          )
          .join("\n")
      : "(none)",
  );

  lines.push("\nOpen tasks (not done):");
  lines.push(
    openTasks.length
      ? openTasks
          .map(
            (t) =>
              `- ${t.id} "${t.title}" [${t.status}, ${t.priority} priority${
                t.scheduled_date
                  ? t.scheduled_time
                    ? `, appointment ${t.scheduled_date} at ${t.scheduled_time}`
                    : `, scheduled ${t.scheduled_date}`
                  : ""
              }${t.due_date ? `, due ${t.due_date}` : ""}${t.someday ? ", someday" : ""}${
                t.someday && t.revisit_date ? `, revisit ${t.revisit_date}` : ""
              }${t.waiting_for ? `, waiting for since ${t.waiting_since}${t.waiting_on ? ` on ${t.waiting_on}` : ""}` : ""}${
                t.waiting_for && t.follow_up_date ? `, follow up ${t.follow_up_date}` : ""
              }]`,
          )
          .join("\n")
      : "(none)",
  );

  lines.push("\nTickler file (notes that aren't tasks yet, resurface on their date):");
  lines.push(
    ticklerItems.length
      ? ticklerItems.map((t) => `- ${t.id} "${t.note}" (revisit ${t.revisit_date})`).join("\n")
      : "(none)",
  );

  lines.push("\nActive habits:");
  lines.push(
    habits.length ? habits.map((h) => `- ${h.id} ${h.name} (${h.frequency})`).join("\n") : "(none)",
  );

  lines.push("\nTraining Log — workout catalog:");
  lines.push(
    workouts.length
      ? workouts
          .map((w) => `- ${w.id} ${w.name}${w.weekly_target ? ` (goal: ${w.weekly_target}x/week)` : ""}`)
          .join("\n")
      : "(none)",
  );

  lines.push("\nTraining Log — logged in the last 7 days:");
  lines.push(
    workoutLogs.length
      ? workoutLogs
          .map((l) => {
            const workoutName =
              (l as unknown as { workouts: { name: string } | null }).workouts?.name ?? "?";
            return `- ${l.logged_date} ${workoutName}${
              l.duration_minutes != null ? ` (${l.duration_minutes} min)` : ""
            }${l.notes ? ` — ${l.notes}` : ""}`;
          })
          .join("\n")
      : "(none)",
  );

  lines.push("\nRoutines:");
  lines.push(
    routines.length
      ? routines
          .map((r) => `- ${r.id} ${r.name} (${r.time_of_day}${r.active ? "" : ", paused"})`)
          .join("\n")
      : "(none)",
  );

  lines.push(
    "\nRecurring tasks (most generate ordinary tasks ahead of time on their schedule; " +
      "recurrence_type \"completion\" instead generates its next occurrence only once the current one " +
      "is marked done):",
  );
  lines.push(
    recurringTemplates.length
      ? recurringTemplates
          .map((t) => `- ${t.id} ${t.title} (${describeRecurrence(t)}${t.active ? "" : ", paused"})`)
          .join("\n")
      : "(none)",
  );

  lines.push("\nChecklists:");
  lines.push(
    checklists.length ? checklists.map((c) => `- ${c.id} ${c.name}`).join("\n") : "(none)",
  );

  lines.push("\nKnowledge library folders:");
  lines.push(
    knowledgeFolders.length
      ? knowledgeFolders.map((f) => `- ${f.id} ${f.name}`).join("\n")
      : "(none)",
  );

  lines.push("\nToday's check-in:");
  lines.push(
    checkin
      ? `Energy ${checkin.energy_level}/5, focus ${checkin.focus_level}/5${
          checkin.notes ? ` — "${checkin.notes}"` : ""
        }`
      : "Not checked in yet today.",
  );

  lines.push("\nOpen agenda items (things to bring up with someone):");
  lines.push(
    openAgendaItems.length
      ? openAgendaItems.map((a) => `- ${a.id} ${a.person_name}: ${a.note}`).join("\n")
      : "(none)",
  );

  lines.push("\nHorizons (GTD goals/vision/purpose):");
  lines.push(
    horizons && (horizons.goals || horizons.vision || horizons.purpose)
      ? [
          horizons.goals ? `Goals: ${horizons.goals}` : null,
          horizons.vision ? `Vision: ${horizons.vision}` : null,
          horizons.purpose ? `Purpose: ${horizons.purpose}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "(not set)",
  );

  if (mode !== "weekly-review") return lines.join("\n");

  const stalledIds = findStalledProjectIds(projects, tasks);
  const stalledProjects = projects.filter((p) => stalledIds.has(p.id));
  const waitingFor = openTasks.filter((t) => t.waiting_for);
  const somedayTasks = openTasks.filter((t) => t.someday);

  lines.push("\nStalled projects (active, zero open tasks):");
  lines.push(
    stalledProjects.length ? stalledProjects.map((p) => `- ${p.id} ${p.name}`).join("\n") : "(none)",
  );

  lines.push("\nWaiting For (delegated):");
  lines.push(
    waitingFor.length
      ? waitingFor
          .map(
            (t) =>
              `- ${t.id} "${t.title}" waiting since ${t.waiting_since}${
                t.waiting_on ? ` on ${t.waiting_on}` : ""
              }${t.follow_up_date ? `, follow up ${t.follow_up_date}` : ""}`,
          )
          .join("\n")
      : "(none)",
  );

  lines.push("\nSomeday/Maybe:");
  lines.push(
    somedayTasks.length ? somedayTasks.map((t) => `- ${t.id} "${t.title}"`).join("\n") : "(none)",
  );

  // Open agenda items and horizons are already in the base context above.

  return lines.join("\n");
}

export async function executeTool(
  supabase: SupabaseClient,
  userId: string,
  today: string,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === "create_task") {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) return "Error: title is required";

    const link = typeof input.link === "string" && input.link.trim() ? input.link.trim() : undefined;
    const context =
      typeof input.context === "string" && input.context.trim() ? input.context.trim() : undefined;
    const waitingFor = typeof input.waiting_for === "boolean" ? input.waiting_for : undefined;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        title,
        link,
        context,
        domain_id: typeof input.domain_id === "string" ? input.domain_id : null,
        priority: typeof input.priority === "string" ? input.priority : undefined,
        due_date: typeof input.due_date === "string" ? input.due_date : undefined,
        scheduled_date: typeof input.scheduled_date === "string" ? input.scheduled_date : undefined,
        scheduled_time:
          typeof input.scheduled_time === "string" && input.scheduled_time ? input.scheduled_time : undefined,
        someday: typeof input.someday === "boolean" ? input.someday : undefined,
        waiting_for: waitingFor,
        waiting_since: waitingFor === true ? today : undefined,
        waiting_on:
          waitingFor === true && typeof input.waiting_on === "string" && input.waiting_on.trim()
            ? input.waiting_on.trim()
            : undefined,
        estimated_minutes: typeof input.estimated_minutes === "number" ? input.estimated_minutes : undefined,
        energy_level: typeof input.energy_required === "string" ? input.energy_required : undefined,
        revisit_date:
          input.someday === true && typeof input.revisit_date === "string" ? input.revisit_date : undefined,
        follow_up_date:
          waitingFor === true && typeof input.follow_up_date === "string" ? input.follow_up_date : undefined,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created task "${data.title}" (${data.domain_id ? "processed" : "in Inbox"}).`;
  }

  if (name === "save_checkin") {
    const energyLevel = typeof input.energy_level === "number" ? input.energy_level : null;
    const focusLevel = typeof input.focus_level === "number" ? input.focus_level : null;
    if (energyLevel === null || focusLevel === null) {
      return "Error: energy_level and focus_level are required";
    }

    const { error } = await supabase.from("daily_checkins").upsert(
      {
        user_id: userId,
        date: typeof input.date === "string" ? input.date : today,
        energy_level: energyLevel,
        focus_level: focusLevel,
        notes: typeof input.notes === "string" ? input.notes : undefined,
      },
      { onConflict: "user_id,date" },
    );

    if (error) return `Error: ${error.message}`;
    return "Check-in saved.";
  }

  if (name === "create_habit") {
    const habitName = typeof input.name === "string" ? input.name.trim() : "";
    if (!habitName) return "Error: name is required";

    const { data, error } = await supabase
      .from("habits")
      .insert({
        user_id: userId,
        name: habitName,
        frequency: typeof input.frequency === "string" ? input.frequency : undefined,
        frequency_days: Array.isArray(input.frequency_days) ? input.frequency_days.map(Number) : null,
        target_count: typeof input.target_count === "number" ? input.target_count : null,
        icon: typeof input.icon === "string" ? input.icon : undefined,
        domain_id: typeof input.domain_id === "string" ? input.domain_id : null,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created habit "${data.name}".`;
  }

  if (name === "update_habit") {
    const habitId = typeof input.habit_id === "string" ? input.habit_id : "";
    if (!habitId) return "Error: habit_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.name === "string") {
      const trimmed = input.name.trim();
      if (!trimmed) return "Error: name cannot be empty";
      updates.name = trimmed;
    }
    if (typeof input.frequency === "string") updates.frequency = input.frequency;
    if (Array.isArray(input.frequency_days)) {
      updates.frequency_days = input.frequency_days.length ? input.frequency_days.map(Number) : null;
    }
    if (typeof input.target_count === "number") updates.target_count = input.target_count;
    if (typeof input.icon === "string") updates.icon = input.icon;
    if (typeof input.active === "boolean") updates.active = input.active;
    if (typeof input.domain_id === "string") updates.domain_id = input.domain_id || null;

    const { data, error } = await supabase
      .from("habits")
      .update(updates)
      .eq("id", habitId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated habit "${data.name}".`;
  }

  if (name === "delete_habit") {
    const habitId = typeof input.habit_id === "string" ? input.habit_id : "";
    if (!habitId) return "Error: habit_id is required";

    const { error } = await supabase
      .from("habits")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", habitId);

    if (error) return `Error: ${error.message}`;
    return "Moved to Trash.";
  }

  if (name === "log_habit") {
    const habitId = typeof input.habit_id === "string" ? input.habit_id : "";
    if (!habitId) return "Error: habit_id is required";

    // The daily cap (7/day) is enforced by a DB trigger
    // (20260715060000_habit_log_daily_cap.sql), whose message is already
    // fit to surface as-is.
    const { error } = await supabase
      .from("habit_logs")
      .insert({ user_id: userId, habit_id: habitId, logged_date: today });

    if (error) return `Error: ${error.message}`;
    return "Logged.";
  }

  if (name === "unlog_habit") {
    const habitId = typeof input.habit_id === "string" ? input.habit_id : "";
    if (!habitId) return "Error: habit_id is required";

    const { data: mostRecent } = await supabase
      .from("habit_logs")
      .select("id")
      .eq("habit_id", habitId)
      .eq("logged_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!mostRecent) return "Wasn't logged today — nothing to undo.";

    const { error } = await supabase.from("habit_logs").delete().eq("id", mostRecent.id);
    if (error) return `Error: ${error.message}`;
    return "Undone. If it was logged more than once today (extra credit), that removed the most recent one.";
  }

  if (name === "create_workout") {
    const workoutName = typeof input.name === "string" ? input.name.trim() : "";
    if (!workoutName) return "Error: name is required";

    const { data, error } = await supabase
      .from("workouts")
      .insert({
        user_id: userId,
        name: workoutName,
        icon: typeof input.icon === "string" ? input.icon : undefined,
        weekly_target: typeof input.weekly_target === "number" ? input.weekly_target : null,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Added "${data.name}" to the training catalog${
      data.weekly_target ? ` with a goal of ${data.weekly_target}x/week` : ""
    }.`;
  }

  if (name === "update_workout") {
    const workoutId = typeof input.workout_id === "string" ? input.workout_id : "";
    if (!workoutId) return "Error: workout_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.name === "string") {
      const trimmed = input.name.trim();
      if (!trimmed) return "Error: name cannot be empty";
      updates.name = trimmed;
    }
    if (typeof input.icon === "string") updates.icon = input.icon;
    if (typeof input.weekly_target === "number") {
      updates.weekly_target = input.weekly_target > 0 ? input.weekly_target : null;
    }

    const { data, error } = await supabase
      .from("workouts")
      .update(updates)
      .eq("id", workoutId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated workout "${data.name}".`;
  }

  if (name === "delete_workout") {
    const workoutId = typeof input.workout_id === "string" ? input.workout_id : "";
    if (!workoutId) return "Error: workout_id is required";

    const { error } = await supabase
      .from("workouts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", workoutId);

    if (error) return `Error: ${error.message}`;
    return "Moved to Trash.";
  }

  if (name === "log_workout") {
    const workoutId = typeof input.workout_id === "string" ? input.workout_id : "";
    if (!workoutId) return "Error: workout_id is required";

    const { error } = await supabase.from("workout_logs").insert({
      user_id: userId,
      workout_id: workoutId,
      logged_date: today,
      duration_minutes: typeof input.duration_minutes === "number" ? input.duration_minutes : null,
      notes: typeof input.notes === "string" ? input.notes : null,
    });

    if (error) return `Error: ${error.message}`;
    return "Logged.";
  }

  if (name === "unlog_workout") {
    const workoutId = typeof input.workout_id === "string" ? input.workout_id : "";
    if (!workoutId) return "Error: workout_id is required";

    const { data: mostRecent } = await supabase
      .from("workout_logs")
      .select("id")
      .eq("workout_id", workoutId)
      .eq("logged_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!mostRecent) return "Wasn't logged today — nothing to undo.";

    const { error } = await supabase.from("workout_logs").delete().eq("id", mostRecent.id);
    if (error) return `Error: ${error.message}`;
    return "Undone. If it was logged more than once today, that removed the most recent one.";
  }

  if (name === "update_task") {
    const taskId = typeof input.task_id === "string" ? input.task_id : "";
    if (!taskId) return "Error: task_id is required";

    const updates: Record<string, unknown> = {};
    let justCompleted = false;
    if (typeof input.status === "string") {
      const { data: existingTask } = await supabase.from("tasks").select("status").eq("id", taskId).maybeSingle();
      updates.status = input.status;
      if (existingTask?.status !== input.status) {
        updates.completed_at = input.status === "done" ? new Date().toISOString() : null;
        justCompleted = input.status === "done";
      }
    }
    if (typeof input.priority === "string") updates.priority = input.priority;
    if (typeof input.link === "string") updates.link = input.link.trim() || null;
    if (typeof input.context === "string") updates.context = input.context.trim() || null;
    if (typeof input.due_date === "string") updates.due_date = input.due_date || null;
    if (typeof input.scheduled_date === "string") updates.scheduled_date = input.scheduled_date || null;
    if (typeof input.scheduled_time === "string") updates.scheduled_time = input.scheduled_time || null;
    if (typeof input.someday === "boolean") updates.someday = input.someday;
    if (typeof input.follow_up_date === "string") updates.follow_up_date = input.follow_up_date || null;
    if (typeof input.waiting_on === "string") updates.waiting_on = input.waiting_on.trim() || null;
    if (typeof input.waiting_for === "boolean") {
      updates.waiting_for = input.waiting_for;
      updates.waiting_since = input.waiting_for ? today : null;
      // Wins over follow_up_date/waiting_on above if both are in the same call.
      if (!input.waiting_for) {
        updates.follow_up_date = null;
        updates.waiting_on = null;
      }
    }
    if (typeof input.domain_id === "string") updates.domain_id = input.domain_id || null;
    if (typeof input.project_id === "string") updates.project_id = input.project_id || null;
    if (typeof input.estimated_minutes === "number") updates.estimated_minutes = input.estimated_minutes || null;
    if (typeof input.energy_required === "string") updates.energy_level = input.energy_required || null;
    if (typeof input.revisit_date === "string") updates.revisit_date = input.revisit_date || null;

    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", taskId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;

    // An after-completion recurring task doesn't pre-generate its next
    // occurrence ahead of time like every other recurrence type — it's
    // spawned here, offset from the date it was actually finished.
    if (justCompleted && data.recurring_template_id) {
      await generateNextCompletionOccurrence(supabase, data.recurring_template_id, today);
    }
    return `Updated task "${data.title}".`;
  }

  if (name === "delete_task") {
    const taskId = typeof input.task_id === "string" ? input.task_id : "";
    if (!taskId) return "Error: task_id is required";

    if (input.scope === "following") {
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select("recurring_template_id, scheduled_date")
        .eq("id", taskId)
        .single();
      if (taskError || !task?.recurring_template_id) {
        return "Error: not part of a recurring series";
      }

      const { error: deleteError } = await supabase
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("recurring_template_id", task.recurring_template_id)
        .is("deleted_at", null)
        .neq("status", "done")
        .gte("scheduled_date", task.scheduled_date ?? "0000-01-01");
      if (deleteError) return `Error: ${deleteError.message}`;

      // Reset last_generated_date too — it points at the (now-deleted)
      // last occurrence, so without this, resuming the series later would
      // resume generation after that stale future date instead of from
      // today.
      await supabase
        .from("recurring_task_templates")
        .update({ active: false, last_generated_date: null })
        .eq("id", task.recurring_template_id);

      return "Moved this and all future occurrences to Trash, and paused the series.";
    }

    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", taskId);

    if (error) return `Error: ${error.message}`;
    return "Moved to Trash.";
  }

  if (name === "convert_task_to_project") {
    const taskId = typeof input.task_id === "string" ? input.task_id : "";
    if (!taskId) return "Error: task_id is required";

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .is("deleted_at", null)
      .single();
    if (taskError || !task) return "Error: task not found";

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        name: task.title,
        description: task.notes,
        domain_id: task.domain_id,
        priority: task.priority,
        due_date: task.due_date,
        scheduled_date: task.scheduled_date,
        link: task.link,
      })
      .select()
      .single();
    if (projectError) return `Error: ${projectError.message}`;

    const { error: trashError } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", taskId);
    if (trashError) {
      return `Project "${project.name}" created, but couldn't trash the original task: ${trashError.message}`;
    }

    return `Converted to project "${project.name}".`;
  }

  if (name === "convert_task_to_knowledge_item") {
    const taskId = typeof input.task_id === "string" ? input.task_id : "";
    if (!taskId) return "Error: task_id is required";

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .is("deleted_at", null)
      .single();
    if (taskError || !task) return "Error: task not found";

    const { data: item, error: itemError } = await supabase
      .from("knowledge_items")
      .insert({
        user_id: userId,
        title: task.title,
        content: task.notes,
        url: task.link,
        type: "note",
      })
      .select()
      .single();
    if (itemError) return `Error: ${itemError.message}`;

    const { error: trashError } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", taskId);
    if (trashError) {
      return `Knowledge item "${item.title}" created, but couldn't trash the original task: ${trashError.message}`;
    }

    return `Filed as reference: "${item.title}".`;
  }

  if (name === "convert_task_to_recurring") {
    const taskId = typeof input.task_id === "string" ? input.task_id : "";
    if (!taskId) return "Error: task_id is required";

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .is("deleted_at", null)
      .single();
    if (taskError || !task) return "Error: task not found";
    if (task.recurring_template_id) return "Error: this task is already part of a recurring series";

    const patternResult = parseRecurrencePattern(input);
    if ("error" in patternResult) return `Error: ${patternResult.error}`;
    const endsResult = parseEnds(input);
    if ("error" in endsResult) return `Error: ${endsResult.error}`;

    const { data: template, error: templateError } = await supabase
      .from("recurring_task_templates")
      .insert({
        user_id: userId,
        title: task.title,
        notes: task.notes,
        link: task.link,
        domain_id: task.domain_id,
        project_id: task.project_id,
        priority: task.priority,
        ...patternResult.pattern,
        ...endsResult.ends,
      })
      .select()
      .single();
    if (templateError) return `Error: ${templateError.message}`;

    const stored = template as StoredTemplate;
    const { error: generateError } =
      stored.recurrence_type === "completion"
        ? await seedCompletionTemplate(supabase, stored)
        : await topUpTemplate(supabase, stored);
    if (generateError) {
      return `Template "${template.title}" created, but generating the first occurrences failed: ${generateError}`;
    }

    const { error: trashError } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", taskId);
    if (trashError) {
      return `Recurring task "${template.title}" created, but couldn't trash the original task: ${trashError.message}`;
    }

    return `Converted to recurring task "${template.title}".`;
  }

  if (name === "update_project") {
    const projectId = typeof input.project_id === "string" ? input.project_id : "";
    if (!projectId) return "Error: project_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.status === "string") updates.status = input.status;
    if (typeof input.priority === "string") updates.priority = input.priority;
    if (typeof input.due_date === "string") updates.due_date = input.due_date || null;
    if (typeof input.scheduled_date === "string") updates.scheduled_date = input.scheduled_date || null;
    if (typeof input.link === "string") updates.link = input.link.trim() || null;
    if (typeof input.domain_id === "string") updates.domain_id = input.domain_id || null;
    if (typeof input.parent_project_id === "string") {
      updates.parent_project_id = input.parent_project_id || null;
    }
    if (typeof input.purpose === "string") updates.purpose = input.purpose || null;
    if (typeof input.outcome_vision === "string") updates.outcome_vision = input.outcome_vision || null;
    if (typeof input.brainstorm === "string") updates.brainstorm = input.brainstorm || null;

    const { data, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", projectId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated project "${data.name}".`;
  }

  if (name === "create_project") {
    const projectName = typeof input.name === "string" ? input.name.trim() : "";
    if (!projectName) return "Error: name is required";

    const link = typeof input.link === "string" && input.link.trim() ? input.link.trim() : undefined;

    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        name: projectName,
        domain_id: typeof input.domain_id === "string" ? input.domain_id : null,
        parent_project_id:
          typeof input.parent_project_id === "string" ? input.parent_project_id : null,
        description: typeof input.description === "string" ? input.description : undefined,
        purpose: typeof input.purpose === "string" ? input.purpose : undefined,
        outcome_vision: typeof input.outcome_vision === "string" ? input.outcome_vision : undefined,
        brainstorm: typeof input.brainstorm === "string" ? input.brainstorm : undefined,
        priority: typeof input.priority === "string" ? input.priority : undefined,
        due_date: typeof input.due_date === "string" ? input.due_date : undefined,
        scheduled_date: typeof input.scheduled_date === "string" ? input.scheduled_date : undefined,
        link,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created project "${data.name}".`;
  }

  if (name === "delete_project") {
    const projectId = typeof input.project_id === "string" ? input.project_id : "";
    if (!projectId) return "Error: project_id is required";

    const { error } = await supabase.rpc("trash_project", { p_project_id: projectId });

    if (error) return `Error: ${error.message}`;
    return "Moved to Trash (subprojects and their tasks went with it, if any).";
  }

  if (name === "create_domain") {
    const domainName = typeof input.name === "string" ? input.name.trim() : "";
    if (!domainName) return "Error: name is required";

    const { data, error } = await supabase
      .from("domains")
      .insert({
        user_id: userId,
        name: domainName,
        color: typeof input.color === "string" ? input.color : undefined,
        icon: typeof input.icon === "string" ? input.icon : undefined,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created domain "${data.name}".`;
  }

  if (name === "update_domain") {
    const domainId = typeof input.domain_id === "string" ? input.domain_id : "";
    if (!domainId) return "Error: domain_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.name === "string") updates.name = input.name.trim();
    if (typeof input.color === "string") updates.color = input.color;
    if (typeof input.icon === "string") updates.icon = input.icon;

    const { data, error } = await supabase
      .from("domains")
      .update(updates)
      .eq("id", domainId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated domain "${data.name}".`;
  }

  if (name === "create_context") {
    const contextName = typeof input.name === "string" ? input.name.trim() : "";
    if (!contextName) return "Error: name is required";

    const { data, error } = await supabase
      .from("contexts")
      .insert({ user_id: userId, name: contextName })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Saved context "${data.name}".`;
  }

  if (name === "update_context") {
    const contextId = typeof input.context_id === "string" ? input.context_id : "";
    if (!contextId) return "Error: context_id is required";
    const contextName = typeof input.name === "string" ? input.name.trim() : "";
    if (!contextName) return "Error: name cannot be empty";

    const { data, error } = await supabase
      .from("contexts")
      .update({ name: contextName })
      .eq("id", contextId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Renamed context to "${data.name}".`;
  }

  if (name === "delete_context") {
    const contextId = typeof input.context_id === "string" ? input.context_id : "";
    if (!contextId) return "Error: context_id is required";

    const { error } = await supabase.from("contexts").delete().eq("id", contextId);

    if (error) return `Error: ${error.message}`;
    return "Deleted context.";
  }

  if (name === "create_routine") {
    const routineName = typeof input.name === "string" ? input.name.trim() : "";
    if (!routineName) return "Error: name is required";

    const { data, error } = await supabase
      .from("routines")
      .insert({
        user_id: userId,
        name: routineName,
        time_of_day: typeof input.time_of_day === "string" ? input.time_of_day : undefined,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created routine "${data.name}".`;
  }

  if (name === "update_routine") {
    const routineId = typeof input.routine_id === "string" ? input.routine_id : "";
    if (!routineId) return "Error: routine_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.name === "string") updates.name = input.name.trim();
    if (typeof input.time_of_day === "string") updates.time_of_day = input.time_of_day;
    if (typeof input.active === "boolean") updates.active = input.active;

    const { data, error } = await supabase
      .from("routines")
      .update(updates)
      .eq("id", routineId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated routine "${data.name}".`;
  }

  if (name === "delete_routine") {
    const routineId = typeof input.routine_id === "string" ? input.routine_id : "";
    if (!routineId) return "Error: routine_id is required";

    const { error } = await supabase
      .from("routines")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", routineId);

    if (error) return `Error: ${error.message}`;
    return "Moved to Trash.";
  }

  if (name === "list_routine_items") {
    const routineId = typeof input.routine_id === "string" ? input.routine_id : "";
    if (!routineId) return "Error: routine_id is required";

    const { data, error } = await supabase
      .from("routine_items")
      .select("id, title, duration_minutes")
      .eq("routine_id", routineId)
      .order("sort_order");

    if (error) return `Error: ${error.message}`;
    if (!data.length) return "This routine has no steps yet.";
    return data
      .map((item) => `- ${item.id} ${item.title}${item.duration_minutes ? ` (${item.duration_minutes} min)` : ""}`)
      .join("\n");
  }

  if (name === "add_routine_item") {
    const routineId = typeof input.routine_id === "string" ? input.routine_id : "";
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!routineId) return "Error: routine_id is required";
    if (!title) return "Error: title is required";

    const { data: last } = await supabase
      .from("routine_items")
      .select("sort_order")
      .eq("routine_id", routineId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("routine_items")
      .insert({
        user_id: userId,
        routine_id: routineId,
        title,
        duration_minutes:
          typeof input.duration_minutes === "number" ? input.duration_minutes : null,
        sort_order: last ? last.sort_order + 1 : 0,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Added "${data.title}" to the routine.`;
  }

  if (name === "update_routine_item") {
    const routineItemId = typeof input.routine_item_id === "string" ? input.routine_item_id : "";
    if (!routineItemId) return "Error: routine_item_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.title === "string") {
      const trimmed = input.title.trim();
      if (!trimmed) return "Error: title cannot be empty";
      updates.title = trimmed;
    }
    if (typeof input.duration_minutes === "number") {
      updates.duration_minutes = input.duration_minutes || null;
    }
    if (typeof input.sort_order === "number") updates.sort_order = input.sort_order;

    const { data, error } = await supabase
      .from("routine_items")
      .update(updates)
      .eq("id", routineItemId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated "${data.title}".`;
  }

  if (name === "delete_routine_item") {
    const routineItemId = typeof input.routine_item_id === "string" ? input.routine_item_id : "";
    if (!routineItemId) return "Error: routine_item_id is required";

    const { error } = await supabase.from("routine_items").delete().eq("id", routineItemId);

    if (error) return `Error: ${error.message}`;
    return "Removed from the routine.";
  }

  if (name === "list_checklist_items") {
    const checklistId = typeof input.checklist_id === "string" ? input.checklist_id : "";
    if (!checklistId) return "Error: checklist_id is required";

    const { data, error } = await supabase
      .from("checklist_items")
      .select("id, title, checked")
      .eq("checklist_id", checklistId)
      .order("sort_order");

    if (error) return `Error: ${error.message}`;
    if (!data.length) return "This checklist has no items yet.";
    return data.map((item) => `- ${item.id} [${item.checked ? "x" : " "}] ${item.title}`).join("\n");
  }

  if (name === "create_checklist") {
    const checklistName = typeof input.name === "string" ? input.name.trim() : "";
    if (!checklistName) return "Error: name is required";

    const { data, error } = await supabase
      .from("checklists")
      .insert({ user_id: userId, name: checklistName })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created checklist "${data.name}".`;
  }

  if (name === "update_checklist") {
    const checklistId = typeof input.checklist_id === "string" ? input.checklist_id : "";
    const checklistName = typeof input.name === "string" ? input.name.trim() : "";
    if (!checklistId) return "Error: checklist_id is required";
    if (!checklistName) return "Error: name is required";

    const { data, error } = await supabase
      .from("checklists")
      .update({ name: checklistName })
      .eq("id", checklistId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Renamed checklist to "${data.name}".`;
  }

  if (name === "delete_checklist") {
    const checklistId = typeof input.checklist_id === "string" ? input.checklist_id : "";
    if (!checklistId) return "Error: checklist_id is required";

    const { error } = await supabase
      .from("checklists")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", checklistId);

    if (error) return `Error: ${error.message}`;
    return "Moved to Trash.";
  }

  if (name === "reset_checklist") {
    const checklistId = typeof input.checklist_id === "string" ? input.checklist_id : "";
    if (!checklistId) return "Error: checklist_id is required";

    const { error } = await supabase
      .from("checklist_items")
      .update({ checked: false })
      .eq("checklist_id", checklistId);

    if (error) return `Error: ${error.message}`;
    return "Checklist reset.";
  }

  if (name === "add_checklist_item") {
    const checklistId = typeof input.checklist_id === "string" ? input.checklist_id : "";
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!checklistId) return "Error: checklist_id is required";
    if (!title) return "Error: title is required";

    const { data: last } = await supabase
      .from("checklist_items")
      .select("sort_order")
      .eq("checklist_id", checklistId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("checklist_items")
      .insert({
        user_id: userId,
        checklist_id: checklistId,
        title,
        sort_order: last ? last.sort_order + 1 : 0,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Added "${data.title}" to the checklist.`;
  }

  if (name === "update_checklist_item") {
    const checklistItemId = typeof input.checklist_item_id === "string" ? input.checklist_item_id : "";
    if (!checklistItemId) return "Error: checklist_item_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.title === "string") {
      const trimmed = input.title.trim();
      if (!trimmed) return "Error: title cannot be empty";
      updates.title = trimmed;
    }
    if (typeof input.checked === "boolean") updates.checked = input.checked;
    if (typeof input.sort_order === "number") updates.sort_order = input.sort_order;

    const { data, error } = await supabase
      .from("checklist_items")
      .update(updates)
      .eq("id", checklistItemId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated "${data.title}".`;
  }

  if (name === "delete_checklist_item") {
    const checklistItemId = typeof input.checklist_item_id === "string" ? input.checklist_item_id : "";
    if (!checklistItemId) return "Error: checklist_item_id is required";

    const { error } = await supabase.from("checklist_items").delete().eq("id", checklistItemId);

    if (error) return `Error: ${error.message}`;
    return "Removed from the checklist.";
  }

  if (name === "create_tickler_item") {
    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (!note) return "Error: note is required";
    const revisitDate = typeof input.revisit_date === "string" ? input.revisit_date : "";
    if (!revisitDate) return "Error: revisit_date is required";

    const { error } = await supabase
      .from("tickler_items")
      .insert({ user_id: userId, note, revisit_date: revisitDate });

    if (error) return `Error: ${error.message}`;
    return "Added to the tickler file.";
  }

  if (name === "update_tickler_item") {
    const ticklerItemId = typeof input.tickler_item_id === "string" ? input.tickler_item_id : "";
    if (!ticklerItemId) return "Error: tickler_item_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.note === "string") {
      const trimmed = input.note.trim();
      if (!trimmed) return "Error: note cannot be empty";
      updates.note = trimmed;
    }
    if (typeof input.revisit_date === "string") updates.revisit_date = input.revisit_date;

    const { error } = await supabase.from("tickler_items").update(updates).eq("id", ticklerItemId);

    if (error) return `Error: ${error.message}`;
    return "Updated tickler item.";
  }

  if (name === "delete_tickler_item") {
    const ticklerItemId = typeof input.tickler_item_id === "string" ? input.tickler_item_id : "";
    if (!ticklerItemId) return "Error: tickler_item_id is required";

    const { error } = await supabase
      .from("tickler_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", ticklerItemId);

    if (error) return `Error: ${error.message}`;
    return "Moved tickler item to Trash.";
  }

  if (name === "convert_tickler_item_to_task") {
    const ticklerItemId = typeof input.tickler_item_id === "string" ? input.tickler_item_id : "";
    if (!ticklerItemId) return "Error: tickler_item_id is required";

    const { data: ticklerItem, error: ticklerError } = await supabase
      .from("tickler_items")
      .select("note")
      .eq("id", ticklerItemId)
      .single();
    if (ticklerError || !ticklerItem) return "Error: tickler item not found";

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({ user_id: userId, title: ticklerItem.note })
      .select()
      .single();
    if (taskError) return `Error: ${taskError.message}`;

    const { error: trashError } = await supabase
      .from("tickler_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", ticklerItemId);
    if (trashError) {
      return `Created task "${task.title}", but couldn't trash the tickler item: ${trashError.message}`;
    }

    return `Converted to task "${task.title}".`;
  }

  if (name === "list_knowledge_items") {
    let query = supabase.from("knowledge_items").select("id, title, type").is("deleted_at", null);
    if (typeof input.type === "string") query = query.eq("type", input.type);
    if (typeof input.folder_id === "string") query = query.eq("folder_id", input.folder_id);
    if (typeof input.tag === "string") query = query.contains("tags", [input.tag]);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return `Error: ${error.message}`;
    if (!data.length) return "No matching knowledge library items.";
    return data.map((item) => `- ${item.id} ${item.title} (${item.type})`).join("\n");
  }

  if (name === "create_knowledge_item") {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) return "Error: title is required";

    const { data, error } = await supabase
      .from("knowledge_items")
      .insert({
        user_id: userId,
        title,
        content: typeof input.content === "string" ? input.content : undefined,
        url: typeof input.url === "string" ? input.url : undefined,
        type: typeof input.type === "string" ? input.type : undefined,
        tags: Array.isArray(input.tags) ? input.tags : null,
        folder_id: typeof input.folder_id === "string" ? input.folder_id : null,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Saved "${data.title}" to the knowledge library.`;
  }

  if (name === "update_knowledge_item") {
    const knowledgeItemId = typeof input.knowledge_item_id === "string" ? input.knowledge_item_id : "";
    if (!knowledgeItemId) return "Error: knowledge_item_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.title === "string") {
      const trimmed = input.title.trim();
      if (!trimmed) return "Error: title cannot be empty";
      updates.title = trimmed;
    }
    if (typeof input.content === "string") updates.content = input.content;
    if (typeof input.url === "string") updates.url = input.url || null;
    if (typeof input.type === "string") updates.type = input.type;
    if (Array.isArray(input.tags)) updates.tags = input.tags.length ? input.tags : null;
    if (typeof input.folder_id === "string") updates.folder_id = input.folder_id || null;

    const { data, error } = await supabase
      .from("knowledge_items")
      .update(updates)
      .eq("id", knowledgeItemId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated "${data.title}".`;
  }

  if (name === "delete_knowledge_item") {
    const knowledgeItemId = typeof input.knowledge_item_id === "string" ? input.knowledge_item_id : "";
    if (!knowledgeItemId) return "Error: knowledge_item_id is required";

    const { error } = await supabase
      .from("knowledge_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", knowledgeItemId);

    if (error) return `Error: ${error.message}`;
    return "Moved to Trash.";
  }

  if (name === "create_knowledge_folder") {
    const folderName = typeof input.name === "string" ? input.name.trim() : "";
    if (!folderName) return "Error: name is required";

    const { data, error } = await supabase
      .from("knowledge_folders")
      .insert({
        user_id: userId,
        name: folderName,
        parent_id: typeof input.parent_id === "string" ? input.parent_id : null,
      })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Created folder "${data.name}".`;
  }

  if (name === "update_knowledge_folder") {
    const folderId = typeof input.folder_id === "string" ? input.folder_id : "";
    if (!folderId) return "Error: folder_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.name === "string") updates.name = input.name.trim();
    if (typeof input.parent_id === "string") updates.parent_id = input.parent_id || null;

    const { data, error } = await supabase
      .from("knowledge_folders")
      .update(updates)
      .eq("id", folderId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated folder "${data.name}".`;
  }

  if (name === "create_agenda_item") {
    const personName = typeof input.person_name === "string" ? input.person_name.trim() : "";
    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (!personName || !note) return "Error: person_name and note are required";

    const { data, error } = await supabase
      .from("agenda_items")
      .insert({ user_id: userId, person_name: personName, note })
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Added agenda item for ${data.person_name}.`;
  }

  if (name === "update_agenda_item") {
    const agendaItemId = typeof input.agenda_item_id === "string" ? input.agenda_item_id : "";
    if (!agendaItemId) return "Error: agenda_item_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.person_name === "string") updates.person_name = input.person_name.trim();
    if (typeof input.note === "string") updates.note = input.note.trim();
    if (typeof input.done === "boolean") updates.done = input.done;

    const { data, error } = await supabase
      .from("agenda_items")
      .update(updates)
      .eq("id", agendaItemId)
      .select()
      .single();

    if (error) return `Error: ${error.message}`;
    return `Updated agenda item for ${data.person_name}.`;
  }

  if (name === "delete_agenda_item") {
    const agendaItemId = typeof input.agenda_item_id === "string" ? input.agenda_item_id : "";
    if (!agendaItemId) return "Error: agenda_item_id is required";

    const { error } = await supabase.from("agenda_items").delete().eq("id", agendaItemId);

    if (error) return `Error: ${error.message}`;
    return "Deleted agenda item.";
  }

  if (name === "update_horizons") {
    const hasGoals = typeof input.goals === "string";
    const hasVision = typeof input.vision === "string";
    const hasPurpose = typeof input.purpose === "string";
    if (!hasGoals && !hasVision && !hasPurpose) {
      return "Error: pass at least one of goals, vision, or purpose";
    }

    // Merge onto the existing single row so a partial update doesn't blank
    // the other fields.
    const { data: existing } = await supabase
      .from("horizons")
      .select("goals, vision, purpose")
      .eq("user_id", userId)
      .maybeSingle();

    const { error } = await supabase.from("horizons").upsert({
      user_id: userId,
      goals: hasGoals ? (input.goals as string) : (existing?.goals ?? ""),
      vision: hasVision ? (input.vision as string) : (existing?.vision ?? ""),
      purpose: hasPurpose ? (input.purpose as string) : (existing?.purpose ?? ""),
      updated_at: new Date().toISOString(),
    });

    if (error) return `Error: ${error.message}`;
    return "Updated horizons.";
  }

  if (name === "list_trash") {
    const results = await Promise.all(
      TRASH_TYPES.map((type) => {
        const { table, nameField } = TRASH_CONFIG[type];
        return supabase.from(table).select(`id, ${nameField}, deleted_at`).not("deleted_at", "is", null);
      }),
    );

    const items: { id: string; type: TrashType; name: string; deleted_at: string }[] = [];
    results.forEach((res, i) => {
      const type = TRASH_TYPES[i];
      const { nameField } = TRASH_CONFIG[type];
      if (res.error || !res.data) return;
      for (const row of res.data as unknown as Record<string, unknown>[]) {
        items.push({
          id: row.id as string,
          type,
          name: (row[nameField] as string) || "(untitled)",
          deleted_at: row.deleted_at as string,
        });
      }
    });
    items.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));

    if (!items.length) return "Trash is empty.";
    return items.map((item) => `- ${item.id} [${item.type}] ${item.name}`).join("\n");
  }

  if (name === "restore_from_trash") {
    const type = typeof input.type === "string" ? input.type : "";
    const id = typeof input.id === "string" ? input.id : "";
    if (!id) return "Error: id is required";
    if (!(COACH_RESTORABLE_TRASH_TYPES as readonly string[]).includes(type)) {
      return `Error: "${type}" can't be restored here — domain restore and purge are app-only.`;
    }

    const config = TRASH_CONFIG[type as TrashType];
    if (config.restoreRpc && config.restoreRpcParam) {
      const { error } = await supabase.rpc(config.restoreRpc, { [config.restoreRpcParam]: id });
      if (error) return `Error: ${error.message}`;
      return "Restored from Trash.";
    }

    const { error } = await supabase.from(config.table).update({ deleted_at: null }).eq("id", id);
    if (error) return `Error: ${error.message}`;
    return "Restored from Trash.";
  }

  if (name === "create_recurring_task") {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) return "Error: title is required";

    const patternResult = parseRecurrencePattern(input);
    if ("error" in patternResult) return `Error: ${patternResult.error}`;
    const endsResult = parseEnds(input);
    if ("error" in endsResult) return `Error: ${endsResult.error}`;

    const { data: template, error } = await supabase
      .from("recurring_task_templates")
      .insert({
        user_id: userId,
        title,
        notes: typeof input.notes === "string" ? input.notes : undefined,
        link: typeof input.link === "string" && input.link.trim() ? input.link.trim() : undefined,
        domain_id: typeof input.domain_id === "string" ? input.domain_id : null,
        project_id: typeof input.project_id === "string" ? input.project_id : null,
        priority: typeof input.priority === "string" ? input.priority : undefined,
        ...patternResult.pattern,
        ...endsResult.ends,
        horizon_count: typeof input.horizon_count === "number" ? input.horizon_count : 12,
      })
      .select()
      .single();
    if (error) return `Error: ${error.message}`;

    const stored = template as StoredTemplate;
    const { error: generateError } =
      stored.recurrence_type === "completion"
        ? await seedCompletionTemplate(supabase, stored)
        : await topUpTemplate(supabase, stored);
    if (generateError) {
      return `Created "${template.title}", but generating the first occurrences failed: ${generateError}`;
    }
    return `Created recurring task "${template.title}".`;
  }

  if (name === "update_recurring_task") {
    const recurringTaskId = typeof input.recurring_task_id === "string" ? input.recurring_task_id : "";
    if (!recurringTaskId) return "Error: recurring_task_id is required";

    const updates: Record<string, unknown> = {};
    if (typeof input.title === "string") {
      const trimmed = input.title.trim();
      if (!trimmed) return "Error: title cannot be empty";
      updates.title = trimmed;
    }
    if (typeof input.notes === "string") updates.notes = input.notes;
    if (typeof input.link === "string") updates.link = input.link.trim() || null;
    if (typeof input.domain_id === "string") updates.domain_id = input.domain_id || null;
    if (typeof input.project_id === "string") updates.project_id = input.project_id || null;
    if (typeof input.priority === "string") updates.priority = input.priority;
    if (typeof input.active === "boolean") updates.active = input.active;
    if (typeof input.horizon_count === "number") updates.horizon_count = input.horizon_count;

    let patternChanged = false;
    if (typeof input.recurrence_type === "string") {
      const { data: existing, error: existingError } = await supabase
        .from("recurring_task_templates")
        .select(
          "recurrence_type, days_of_week, day_of_month, interval_days, month_of_year, week_of_month, weekday_of_month, month_clamp, completion_offset_count, completion_offset_unit",
        )
        .eq("id", recurringTaskId)
        .single();
      if (existingError || !existing) return `Error: ${existingError?.message ?? "Not found"}`;

      const patternResult = parseRecurrencePattern(input);
      if ("error" in patternResult) return `Error: ${patternResult.error}`;
      Object.assign(updates, patternResult.pattern);

      const sortedDays = (d: number[] | null) => JSON.stringify([...(d ?? [])].sort());
      patternChanged =
        patternResult.pattern.recurrence_type !== existing.recurrence_type ||
        sortedDays(patternResult.pattern.days_of_week) !== sortedDays(existing.days_of_week) ||
        (patternResult.pattern.day_of_month ?? null) !== (existing.day_of_month ?? null) ||
        (patternResult.pattern.interval_days ?? null) !== (existing.interval_days ?? null) ||
        (patternResult.pattern.month_of_year ?? null) !== (existing.month_of_year ?? null) ||
        (patternResult.pattern.week_of_month ?? null) !== (existing.week_of_month ?? null) ||
        (patternResult.pattern.weekday_of_month ?? null) !== (existing.weekday_of_month ?? null) ||
        patternResult.pattern.month_clamp !== (existing.month_clamp ?? "clamp") ||
        (patternResult.pattern.completion_offset_count ?? null) !== (existing.completion_offset_count ?? null) ||
        (patternResult.pattern.completion_offset_unit ?? null) !== (existing.completion_offset_unit ?? null);

      if (patternChanged) updates.last_generated_date = null;
    }

    if (
      input.ends_type !== undefined ||
      input.ends_date !== undefined ||
      input.ends_count !== undefined
    ) {
      const endsResult = parseEnds(input);
      if ("error" in endsResult) return `Error: ${endsResult.error}`;
      Object.assign(updates, endsResult.ends);
    }

    const { data, error } = await supabase
      .from("recurring_task_templates")
      .update(updates)
      .eq("id", recurringTaskId)
      .select()
      .single();
    if (error) return `Error: ${error.message}`;

    if (patternChanged) {
      const { error: detachError } = await supabase
        .from("tasks")
        .update({ recurring_template_id: null })
        .eq("recurring_template_id", recurringTaskId)
        .is("deleted_at", null)
        .neq("status", "done")
        .gte("scheduled_date", today);
      if (detachError) return `Pattern updated, but detaching old occurrences failed: ${detachError.message}`;

      const stored = data as StoredTemplate;
      const { error: generateError } =
        stored.recurrence_type === "completion"
          ? await seedCompletionTemplate(supabase, stored)
          : await topUpTemplate(supabase, stored);
      if (generateError) return `Pattern updated, but generating new occurrences failed: ${generateError}`;
    }

    return `Updated recurring task "${data.title}".`;
  }

  if (name === "delete_recurring_task") {
    const recurringTaskId = typeof input.recurring_task_id === "string" ? input.recurring_task_id : "";
    if (!recurringTaskId) return "Error: recurring_task_id is required";

    const { error } = await supabase.from("recurring_task_templates").delete().eq("id", recurringTaskId);
    if (error) return `Error: ${error.message}`;
    return "Deleted recurring task template.";
  }

  if (name === "generate_recurring_tasks") {
    const { data: templates, error } = await supabase
      .from("recurring_task_templates")
      .select("*")
      .eq("active", true);
    if (error) return `Error: ${error.message}`;

    const results = await Promise.all(
      (templates as StoredTemplate[]).map((template) => topUpTemplate(supabase, template)),
    );
    const generatedTotal = results.reduce((sum, r) => sum + r.generated, 0);
    return generatedTotal > 0
      ? `Generated ${generatedTotal} task(s) across ${templates.length} template(s).`
      : "Everything's already topped up — nothing to generate.";
  }

  return `Error: unknown tool ${name}`;
}
