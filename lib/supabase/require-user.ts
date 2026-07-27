import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  // The proxy (proxy.ts) already made the network round-trip to Supabase
  // Auth for this request — it has to, to refresh the session cookie. Here
  // getClaims() verifies the JWT locally (cached signing keys) instead of
  // repeating that round-trip in every route handler; on projects still
  // using a symmetric JWT secret it transparently falls back to the old
  // server-side check, so behavior is identical either way.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  return { supabase, user: claims ? { id: claims.sub } : null };
}
