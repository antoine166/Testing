import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { findGmailPermalink } from "@/lib/gmail/client";

const MAX_NOTES_LENGTH = 5000;

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}

// Forwarding always prepends "Fwd:" (sometimes several times over multiple
// forwards) — strip it since the task is already understood to come from an
// email, no need to carry that noise into the title.
function stripForwardPrefix(subject: string): string {
  return subject.replace(/^(\s*(fwd?|fw)\s*:\s*)+/gi, "").trim();
}

function extractLink(body: string): string | undefined {
  const matches = (body.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []).map((m) =>
    m.replace(/[.,;:]+$/, ""),
  );
  // Prefer a Gmail permalink if one was pasted into the forward, even if it's
  // not the first link (e.g. below a signature with other links).
  return matches.find((url) => url.includes("mail.google.com")) ?? matches[0];
}

// No user session here — this is a public webhook Resend calls when an
// email arrives. Auth is: (1) the svix signature proves the request really
// came from Resend, (2) the sender allowlist proves it's actually Antoine
// forwarding something, not anyone who discovers the receiving address.
export async function POST(request: Request) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Inbound email isn't configured" }, { status: 503 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const payload = await request.text();

  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "email.received") {
    return new NextResponse(null, { status: 200 });
  }

  const allowedSenders = (process.env.INBOUND_ALLOWED_SENDER ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const sender = extractEmail(event.data.from);
  if (allowedSenders.length === 0 || !allowedSenders.includes(sender)) {
    // Quietly no-op rather than 403 — don't give away why it failed.
    return new NextResponse(null, { status: 200 });
  }

  const { data: email, error: fetchError } = await resend.emails.receiving.get(
    event.data.email_id,
  );
  if (fetchError || !email) {
    return NextResponse.json({ error: "Failed to fetch email content" }, { status: 500 });
  }

  const title = (stripForwardPrefix(event.data.subject || "") || "Untitled").slice(0, 200);
  const body = email.text || (email.html ? stripHtml(email.html) : "");
  const notes = body.slice(0, MAX_NOTES_LENGTH) || undefined;
  const fallbackLink = extractLink(body);

  // Single-user app — the email allowed to trigger this (INBOUND_ALLOWED_SENDER)
  // doesn't have to be the same address the account was created with, so this
  // targets whichever account exists rather than searching for an email match.
  const admin = createAdminClient();
  const { data: users, error: usersError } = await admin.auth.admin.listUsers();
  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const owner = users.users[0];
  if (!owner) {
    return NextResponse.json({ error: "No account exists to own this task" }, { status: 500 });
  }

  // Prefer an authoritative Gmail permalink (via the connected account, if
  // any) over whatever link parsing found pasted in the forward body —
  // Gmail's own forward format doesn't reliably include one.
  const gmailLink = event.data.message_id
    ? await findGmailPermalink(admin, owner.id, event.data.message_id)
    : undefined;
  const link = gmailLink ?? fallbackLink;

  const { data: task, error: insertError } = await admin
    .from("tasks")
    .insert({
      user_id: owner.id,
      title,
      notes,
      link,
      source_message_id: event.data.message_id,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      // Same Message-ID already created a task — a redelivered webhook or a
      // duplicate send, not a new email. Nothing more to do.
      return new NextResponse(null, { status: 200 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await attachImages(resend, admin, event.data.email_id, owner.id, task.id, email.attachments);

  return new NextResponse(null, { status: 200 });
}

type EmailAttachment = { id: string; filename: string | null; content_type: string };

// Best-effort: image attachments failing to save shouldn't fail the whole
// webhook, since the task itself (the important part) is already created.
async function attachImages(
  resend: Resend,
  admin: ReturnType<typeof createAdminClient>,
  emailId: string,
  userId: string,
  taskId: string,
  attachments: EmailAttachment[],
) {
  const images = attachments.filter((a) => a.content_type?.startsWith("image/"));

  for (const attachment of images) {
    try {
      const { data: full } = await resend.emails.receiving.attachments.get({
        emailId,
        id: attachment.id,
      });
      if (!full?.download_url) continue;

      const fileRes = await fetch(full.download_url);
      if (!fileRes.ok) continue;
      const bytes = await fileRes.arrayBuffer();

      const filename = attachment.filename || `image-${attachment.id}`;
      const storagePath = `${userId}/${taskId}/${crypto.randomUUID()}-${filename}`;
      const { error: uploadError } = await admin.storage
        .from("task-attachments")
        .upload(storagePath, bytes, { contentType: attachment.content_type });
      if (uploadError) continue;

      await admin.from("task_attachments").insert({
        user_id: userId,
        task_id: taskId,
        storage_path: storagePath,
        filename,
        content_type: attachment.content_type,
        size: bytes.byteLength,
      });
    } catch {
      // Skip this attachment, keep processing the rest.
    }
  }
}
