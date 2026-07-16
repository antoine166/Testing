-- Enable Supabase Realtime (live updates across tabs/devices) for the
-- tables the app actually subscribes to. RLS (already enabled on every
-- table below) scopes which rows a given client receives.
alter publication supabase_realtime add table
  domains,
  projects,
  tasks,
  habits,
  habit_logs,
  daily_checkins,
  checklists,
  checklist_items,
  routines,
  routine_items,
  knowledge_items,
  knowledge_folders,
  agenda_items;
