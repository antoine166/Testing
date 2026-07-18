-- GTD's Natural Planning Model for multi-step work: Purpose -> Outcome
-- Vision -> Brainstorm -> Organize -> Next Action. Purpose and Outcome
-- Vision are the two upfront questions worth capturing as structured
-- fields (distinct from the general-purpose `description`) — brainstorm/
-- organize stay as ordinary tasks under the project, not a separate field.
alter table projects add column purpose text;
alter table projects add column outcome_vision text;
