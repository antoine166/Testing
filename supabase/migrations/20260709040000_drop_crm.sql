-- Removes the Personal CRM feature (contacts, contact_interactions) —
-- decided unnecessary for Antoine's workflow. This is a genuine drop, not a
-- soft delete: any contact data in these tables is gone once this runs.
--
-- The tables originated in 20260709010000_phase3_crm.sql and were later
-- extended by 20260709020000_trash_bin.sql (deleted_at column, index, RLS
-- already in place). Those files are left as historical record rather than
-- edited — this migration is the one that actually undoes them.

drop table if exists contact_interactions;
drop table if exists contacts;
drop function if exists update_contact_last_contacted();
