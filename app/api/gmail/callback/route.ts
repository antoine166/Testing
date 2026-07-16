import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/require-user";
import { exchangeCodeForTokens, fetchGoogleAccountEmail } from "@/lib/gmail/client";

const STATE_COOKIE = "gmail_oauth_state";

export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  const settingsUrl = (status: string) => new URL(`/settings?gmail=${status}`, request.url);

  if (oauthError) {
    return NextResponse.redirect(settingsUrl("denied"));
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(settingsUrl("error"));
  }

  try {
    const redirectUri = new URL("/api/gmail/callback", request.url).toString();
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    if (!tokens.refresh_token) {
      // Shouldn't happen with prompt=consent (see buildAuthorizeUrl), but
      // without a refresh token the connection can't outlive the ~1hr
      // access token, so treat it as a failure rather than storing
      // something that'll silently stop working within the hour.
      return NextResponse.redirect(settingsUrl("error"));
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const email = await fetchGoogleAccountEmail(tokens.access_token);

    const row = {
      user_id: user.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scope: tokens.scope,
      email,
      updated_at: new Date().toISOString(),
    };

    // Multiple accounts can be connected at once, identified by email. If
    // this exact account is already connected, update its tokens in place
    // rather than adding a duplicate row. If not, but there's a
    // pre-existing connection from before multi-account support with no
    // email on file, adopt that row instead of leaving it orphaned.
    const { data: existing } = await supabase
      .from("gmail_connections")
      .select("id, email")
      .eq("user_id", user.id);

    const targetId =
      existing?.find((c) => c.email === email)?.id ?? existing?.find((c) => c.email === null)?.id;

    const { error: dbError } = targetId
      ? await supabase.from("gmail_connections").update(row).eq("id", targetId)
      : await supabase.from("gmail_connections").insert(row);
    if (dbError) {
      return NextResponse.redirect(settingsUrl("error"));
    }

    return NextResponse.redirect(settingsUrl("connected"));
  } catch {
    return NextResponse.redirect(settingsUrl("error"));
  }
}
