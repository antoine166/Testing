export type TrashType =
  | "domain"
  | "project"
  | "task"
  | "habit"
  | "workout"
  | "routine"
  | "checklist"
  | "knowledge-item"
  | "tickler-item"
  | "person";

export const TRASH_TYPES: TrashType[] = [
  "domain",
  "project",
  "task",
  "habit",
  "workout",
  "routine",
  "checklist",
  "knowledge-item",
  "tickler-item",
  "person",
];

type TrashConfig = {
  table: string;
  nameField: string;
  /** Set only for types whose delete cascades to children (domains, projects). */
  restoreRpc?: string;
  restoreRpcParam?: string;
  purgeRpc?: string;
  purgeRpcParam?: string;
};

export const TRASH_CONFIG: Record<TrashType, TrashConfig> = {
  domain: {
    table: "domains",
    nameField: "name",
    restoreRpc: "restore_domain",
    restoreRpcParam: "p_domain_id",
    purgeRpc: "purge_domain_now",
    purgeRpcParam: "p_domain_id",
  },
  project: {
    table: "projects",
    nameField: "name",
    restoreRpc: "restore_project",
    restoreRpcParam: "p_project_id",
    purgeRpc: "purge_project_now",
    purgeRpcParam: "p_project_id",
  },
  task: { table: "tasks", nameField: "title" },
  habit: { table: "habits", nameField: "name" },
  workout: { table: "workouts", nameField: "name" },
  routine: { table: "routines", nameField: "name" },
  checklist: { table: "checklists", nameField: "name" },
  "knowledge-item": { table: "knowledge_items", nameField: "title" },
  "tickler-item": { table: "tickler_items", nameField: "note" },
  person: { table: "people", nameField: "name" },
};

export function isTrashType(value: string): value is TrashType {
  return (TRASH_TYPES as string[]).includes(value);
}
