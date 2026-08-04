import { NextResponse } from "next/server";

/**
 * The running deployment's identity. The standalone PWA has no reload
 * button and holds its window open across deploys, so the client polls
 * this (on foreground and on an interval) and offers [ UPDATE ] when the
 * answer changes. Vercel injects the commit SHA at runtime.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { v: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "cache-control": "no-store" } },
  );
}
