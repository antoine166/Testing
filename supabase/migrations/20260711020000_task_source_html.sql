-- Stores a sanitized copy of the original email's HTML for tasks created
-- via email capture, so the app can render it close to how the email
-- actually looked instead of only the flattened plain-text notes.
-- Sanitized once at ingestion time in the webhook (see
-- app/api/webhooks/resend-inbound/route.ts) — never render raw HTML from
-- this column without that sanitization step happening first.
alter table tasks add column source_html text;
