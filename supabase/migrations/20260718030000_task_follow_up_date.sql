-- GTD's Waiting For is only useful if it prompts an actual follow-up, not
-- just a passive elapsed-days counter — this is an explicit "nudge me on
-- this date" trigger, only meaningful when waiting_for is true.
alter table tasks add column follow_up_date date;
