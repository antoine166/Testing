-- A single optional URL per task, shown between the title and notes. For
-- forwarded emails this is auto-filled from the first link found in the
-- email body (see app/api/webhooks/resend-inbound).
alter table tasks add column link text;
