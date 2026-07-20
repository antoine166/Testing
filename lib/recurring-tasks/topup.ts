import type { SupabaseClient } from "@supabase/supabase-js";
import { todayLocal } from "@/lib/date";
import { addCompletionOffset, nextOccurrences, type RecurringTemplate } from "@/lib/recurring-tasks/generate";
import type { CompletionOffsetUnit, EndsType } from "@/lib/recurring-tasks/types";

export type StoredTemplate = RecurringTemplate & {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  link: string | null;
  domain_id: string | null;
  project_id: string | null;
  priority: string;
  horizon_count: number;
  active: boolean;
  completion_offset_count: number | null;
  completion_offset_unit: CompletionOffsetUnit | null;
  ends_type: EndsType;
  ends_date: string | null;
  ends_count: number | null;
  occurrences_generated: number;
};

function taskFromTemplate(template: StoredTemplate, date: string) {
  return {
    user_id: template.user_id,
    title: template.title,
    notes: template.notes,
    link: template.link,
    domain_id: template.domain_id,
    project_id: template.project_id,
    priority: template.priority,
    due_date: date,
    scheduled_date: date,
    recurring_template_id: template.id,
  };
}

/** Would generating one more occurrence dated `date` violate the template's Ends setting? */
function endsBlock(template: StoredTemplate, date: string): boolean {
  if (template.ends_type === "count") return template.occurrences_generated >= (template.ends_count ?? 0);
  if (template.ends_type === "date") return date > (template.ends_date ?? "9999-99-99");
  return false;
}

/**
 * Generates enough occurrences to bring a template's future, incomplete,
 * generated task count back up to its horizon — never more than that in one
 * call, so this is safe to run repeatedly (idempotent — re-running with no
 * deficit generates nothing) and can't runaway-generate regardless of how
 * often it's triggered.
 *
 * No-op for recurrence_type "completion": those spawn one occurrence at a
 * time when the prior one is completed (see the task-completion route), not
 * ahead of a horizon.
 */
export async function topUpTemplate(
  supabase: SupabaseClient,
  template: StoredTemplate,
): Promise<{ generated: number; error?: string }> {
  if (template.recurrence_type === "completion") return { generated: 0 };

  const today = todayLocal();

  const { count, error: countError } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("recurring_template_id", template.id)
    .is("deleted_at", null)
    .neq("status", "done")
    .gte("scheduled_date", today);

  if (countError) return { generated: 0, error: countError.message };

  let deficit = template.horizon_count - (count ?? 0);
  if (deficit <= 0) return { generated: 0 };

  if (template.ends_type === "count") {
    const remaining = (template.ends_count ?? 0) - template.occurrences_generated;
    if (remaining <= 0) return { generated: 0 };
    deficit = Math.min(deficit, remaining);
  }

  let dates = nextOccurrences(template, today, deficit);
  if (template.ends_type === "date" && template.ends_date) {
    // Dates come out strictly increasing, so the first one past ends_date
    // means every date after it is too — truncate there instead of
    // filtering the whole array.
    const cutoff = dates.findIndex((d) => d > template.ends_date!);
    if (cutoff !== -1) dates = dates.slice(0, cutoff);
  }
  if (dates.length === 0) return { generated: 0 };

  const { error: insertError } = await supabase.from("tasks").insert(dates.map((date) => taskFromTemplate(template, date)));
  if (insertError) return { generated: 0, error: insertError.message };

  const lastDate = dates[dates.length - 1];
  const { error: updateError } = await supabase
    .from("recurring_task_templates")
    .update({ last_generated_date: lastDate, occurrences_generated: template.occurrences_generated + dates.length })
    .eq("id", template.id);
  if (updateError) return { generated: dates.length, error: updateError.message };

  return { generated: dates.length };
}

/**
 * Seeds the single initial occurrence for a brand-new "completion" template
 * — unlike every other recurrence_type, these don't pre-generate ahead of a
 * horizon (see topUpTemplate above), so without this a freshly-created
 * after-completion template would have nothing to complete yet.
 */
export async function seedCompletionTemplate(
  supabase: SupabaseClient,
  template: StoredTemplate,
): Promise<{ error?: string }> {
  const today = todayLocal();
  const { error: insertError } = await supabase.from("tasks").insert(taskFromTemplate(template, today));
  if (insertError) return { error: insertError.message };

  const { error: updateError } = await supabase
    .from("recurring_task_templates")
    .update({ last_generated_date: today, occurrences_generated: 1 })
    .eq("id", template.id);
  if (updateError) return { error: updateError.message };

  return {};
}

/**
 * Spawns the next occurrence of a "completion" template's series, offset
 * from the date the prior occurrence was actually completed — called from
 * the task-completion route (PUT /api/tasks/[id]) when a task belonging to
 * one of these templates transitions to done. No-op if the template was
 * paused, isn't completion-anchored, or its Ends condition is already met.
 */
export async function generateNextCompletionOccurrence(
  supabase: SupabaseClient,
  templateId: string,
  completedDate: string,
): Promise<{ generated: number; error?: string }> {
  const { data: template, error: fetchError } = await supabase
    .from("recurring_task_templates")
    .select("*")
    .eq("id", templateId)
    .single();

  if (fetchError || !template) return { generated: 0, error: fetchError?.message };
  const stored = template as StoredTemplate;
  if (stored.recurrence_type !== "completion" || !stored.active) return { generated: 0 };

  const nextDate = addCompletionOffset(
    completedDate,
    stored.completion_offset_count ?? 1,
    stored.completion_offset_unit ?? "day",
  );
  if (endsBlock(stored, nextDate)) return { generated: 0 };

  const { error: insertError } = await supabase.from("tasks").insert(taskFromTemplate(stored, nextDate));
  if (insertError) return { generated: 0, error: insertError.message };

  const { error: updateError } = await supabase
    .from("recurring_task_templates")
    .update({ last_generated_date: nextDate, occurrences_generated: stored.occurrences_generated + 1 })
    .eq("id", templateId);
  if (updateError) return { generated: 1, error: updateError.message };

  return { generated: 1 };
}
