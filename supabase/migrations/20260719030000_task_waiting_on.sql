-- GTD-style Waiting For already tracks *when* (waiting_since,
-- follow_up_date) but not *who* — "everything I'm waiting on from Marcus"
-- had no way to be a real filter, only archaeology through free-text
-- notes. Mirrors agenda_items.person_name (free text, not a contacts/CRM
-- table — that was dropped there too). Only meaningful when waiting_for is
-- true, same gating as follow_up_date.
alter table tasks add column waiting_on text;
