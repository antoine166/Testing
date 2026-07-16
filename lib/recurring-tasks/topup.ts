import type { SupabaseClient } from "@supabase/supabase-js";
import { todayLocal } from "@/lib/date";
import { nextOccurrences, type RecurringTemplate } from "@/lib/recurring-tasks/generate";

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
};

/**
 * Generates enough occurrences to bring a template's future, incomplete,
 * generated task count back up to its horizon — never more than that in one
 * call, so this is safe to run repeatedly (idempotent — re-running with no
 * deficit generates nothing) and can't runaway-generate regardless of how
 * often it's triggered.
 */
export async function topUpTemplate(
  supabase: SupabaseClient,
  template: StoredTemplate,
): Promise<{ generated: number; error?: string }> {
  const today = todayLocal();

  const { count, error: countError } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("recurring_template_id", template.id)
    .is("deleted_at", null)
    .neq("status", "done")
    .gte("scheduled_date", today);

  if (countError) return { generated: 0, error: countError.message };

  const deficit = template.horizon_count - (count ?? 0);
  if (deficit <= 0) return { generated: 0 };

  const dates = nextOccurrences(template, today, deficit);
  if (dates.length === 0) return { generated: 0 };

  const { error: insertError } = await supabase.from("tasks").insert(
    dates.map((date) => ({
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
    })),
  );
  if (insertError) return { generated: 0, error: insertError.message };

  const lastDate = dates[dates.length - 1];
  const { error: updateError } = await supabase
    .from("recurring_task_templates")
    .update({ last_generated_date: lastDate })
    .eq("id", template.id);
  if (updateError) return { generated: dates.length, error: updateError.message };

  return { generated: dates.length };
}
