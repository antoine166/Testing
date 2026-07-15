import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/require-user";
import { buildAuthorizeUrl, isGmailConfigured } from "@/lib/gmail/client";

const STATE_COOKIE = "gmail_oauth_state";

// Kicks off connecting Antoine's Gmail account so forwarded emails can be
// auto-linked back to the original message (see lib/gmail/client.ts). Only
// reachable while logged in; Google redirects back to /api/gmail/callback.
export async function GET(request: Request) {
  const { user } = await requireUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!isGmailConfigured()) {
    return NextResponse.json(
      { error: "Gmail isn't configured yet — GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are missing." },
      { status: 503 },
    );
  }

  const state = randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/gmail",
  });

  const redirectUri = new URL("/api/gmail/callback", request.url).toString();
  return NextResponse.redirect(buildAuthorizeUrl(redirectUri, state));
}
