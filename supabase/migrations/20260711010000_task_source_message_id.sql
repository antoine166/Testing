-- Dedup for email-captured tasks: Resend can redeliver the same inbound
-- webhook (or the same email can otherwise land twice), which previously
-- created a duplicate task each time. An email's Message-ID is stable
-- across redeliveries of that same message, so storing it lets the webhook
-- recognize "already processed" and skip via a unique-constraint conflict.
alter table tasks add column source_message_id text;

create unique index tasks_source_message_id_idx
  on tasks(source_message_id)
  where source_message_id is not null;
