"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client, for Client Components. Server Components
 * and Route Handlers use lib/supabase/server.ts instead — the two differ
 * only in how they read/write the session cookie.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
