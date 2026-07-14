import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components can't set cookies, so a refresh triggered
            // here is computed but discarded — expected and harmless.
            // components/session-refresh.tsx periodically hits
            // /api/auth/refresh (a Route Handler, which can set cookies)
            // so the refresh actually persists.
          }
        },
      },
    },
  );
}
