import type { NextConfig } from "next";

// TEMPORARY DIAGNOSTIC — remove once the Vercel env-var mystery is solved.
// next.config.ts executes at build startup, before any bundling, so this
// runs inside Vercel's actual build container and lands directly in the
// build log. It tells us definitively whether the container's Node process
// sees these vars at all — separate from whether Next.js's bundler later
// manages to inline them into client code. Values are truncated, never
// printed in full, even though the anon key is non-sensitive by design.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
console.log("[env-diagnostic] NEXT_PUBLIC_SUPABASE_URL:", url ? `SET (${url.slice(0, 28)}...)` : "MISSING");
console.log("[env-diagnostic] NEXT_PUBLIC_SUPABASE_ANON_KEY:", anon ? `SET (len=${anon.length}, starts "${anon.slice(0, 12)}...")` : "MISSING");
console.log("[env-diagnostic] VERCEL_ENV:", process.env.VERCEL_ENV ?? "(not set — not running on Vercel)");
console.log("[env-diagnostic] NODE_ENV:", process.env.NODE_ENV);

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
