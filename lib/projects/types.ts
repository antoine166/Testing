export type ProjectStatus = "active" | "someday" | "completed" | "archived";
export type ProjectPriority = "none" | "low" | "medium" | "high";

export type Project = {
  id: string;
  domain_id: string | null;
  parent_project_id: string | null;
  name: string;
  description: string | null;
  purpose: string | null;
  outcome_vision: string | null;
  brainstorm: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  due_date: string | null;
  scheduled_date: string | null;
  link: string | null;
  review_every_days: number | null;
  last_reviewed_at: string | null;
  created_at: string;
};

export type SupportItem = { id: string; title: string; type: string; url: string | null; project_id: string | null };

export type ProjectTemplate = {
  id: string;
  name: string;
  domain_id: string | null;
  priority: ProjectPriority;
  project_template_tasks: { id: string; title: string }[];
};

export const STATUSES: ProjectStatus[] = ["active", "someday", "completed", "archived"];
export const PRIORITIES: ProjectPriority[] = ["none", "low", "medium", "high"];
