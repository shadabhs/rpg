import { notFound } from "next/navigation";
import { PreviewHarness, type Scenario } from "@/components/PreviewHarness";

/**
 * UI QA harness. Renders the real Status Window against in-memory data
 * so the authenticated UI can be driven by a browser without Supabase.
 *
 * Gated on a server-side env var that production never sets, and checked
 * at request time (not inlined at build time), so a preview build can
 * never accidentally ship a reachable route. proxy.ts applies the same
 * condition before letting the path past the auth gate.
 */
export const dynamic = "force-dynamic";

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  if (process.env.PREVIEW_MODE !== "1") notFound();

  const { scenario } = await searchParams;
  const chosen: Scenario =
    scenario === "fresh" || scenario === "reloaded" ? scenario : "seasoned";

  return <PreviewHarness scenario={chosen} />;
}
