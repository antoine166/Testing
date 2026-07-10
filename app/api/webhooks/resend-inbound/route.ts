import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const title = (event.data.subject || "Untitled").trim().slice(0, 200);
  const body = email.text || (email.html ? stripHtml(email.html) : "");
  const notes = body.slice(0, MAX_NOTES_LENGTH) || undefined;

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

  const { error: insertError } = await admin.from("tasks").insert({
    user_id: owner.id,
    title,
    notes,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 200 });
}
