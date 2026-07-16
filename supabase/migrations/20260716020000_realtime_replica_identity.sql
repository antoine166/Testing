-- Realtime's Postgres Changes needs the full old row (not just the primary
-- key) to evaluate RLS policies like "auth.uid() = user_id" on UPDATE and
-- DELETE events. Without REPLICA IDENTITY FULL, Postgres's replication
-- stream only includes the primary key for those events, so Realtime can't
-- check the policy and silently drops them — INSERT events are unaffected
-- since they always carry the full new row.
alter table domains replica identity full;
alter table projects replica identity full;
alter table tasks replica identity full;
alter table habits replica identity full;
alter table habit_logs replica identity full;
alter table daily_checkins replica identity full;
alter table checklists replica identity full;
alter table checklist_items replica identity full;
alter table routines replica identity full;
alter table routine_items replica identity full;
alter table knowledge_items replica identity full;
alter table knowledge_folders replica identity full;
alter table agenda_items replica identity full;
