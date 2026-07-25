-- Recurring task templates carry the same GTD "Context" trio as tasks —
-- Time (estimated_minutes), Energy (energy_level), Location (context); see
-- 20260718000000_task_time_energy.sql and 20260714020000_task_context.sql —
-- so every generated occurrence inherits it instead of landing context-less.
-- Same column names and constraints as on tasks, since the generator copies
-- these values straight onto the task rows it inserts.
alter table recurring_task_templates add column context text;
alter table recurring_task_templates add column estimated_minutes int check (estimated_minutes > 0);
alter table recurring_task_templates add column energy_level text
  check (energy_level in ('low', 'medium', 'high'));
