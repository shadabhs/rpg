import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client, for Server Components, Server Actions, and
 * Route Handlers. Every query made with this client is subject to the RLS
 * policies in db/policies.sql — there is no separate "trusted" path, which
 * is the point: the server can't accidentally bypass a user's own row
 * boundary just because the code is running server-side.
 */
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
            // Called from a Server Component, which can't set cookies.
            // Harmless as long as middleware is also refreshing the
            // session — Phase 1 slice 2 adds that alongside the auth gate.
          }
        },
      },
    },
  );
}
