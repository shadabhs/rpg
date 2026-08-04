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
      global: {
        /**
         * Never let Next's Data Cache serve a database read. Without this,
         * supabase-js calls fetch() with no cache directive and Next is
         * free to memoize the REST response — which it demonstrably did in
         * production: live QA observed the Status Window serving a STALE
         * event log across genuine hard reloads, and the undo action
         * failing because its own read couldn't see a completion that was
         * committed minutes earlier. An event-sourced app must read its
         * log fresh, every time, everywhere.
         */
        fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
      },
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
