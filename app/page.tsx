import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rowToEvent, type EventRow, type QuestRow } from "@/db/mappers";
import { StatusWindowClient } from "@/components/StatusWindowClient";

/**
 * The Status Window. Server Component: fetches the authenticated user's
 * real data and hands it to the client component that owns the
 * interactive/animated UI. lib/data.ts (Phase 0's fake data) is gone —
 * this is what replaced it.
 */
export default async function StatusWindowPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login"); // middleware already guarantees this; belt and suspenders

  // First visit for this user: create the cosmetic profile row. Character
  // starts at Level 1, every domain at 0 — per AGENTS.md, "Level 1 must
  // feel weak," and there is no Induction interview yet to derive a
  // richer starting point from (that needs its own Anthropic Console
  // account, a separate slice).
  await supabase
    .from("profiles")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("character_name, title")
    .eq("user_id", user.id)
    .single();

  const { data: questRows } = await supabase
    .from("quests")
    .select(
      "id, title, domain, difficulty, when_text, where_text, weighty, cadence, grants, status",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const { data: eventRows } = await supabase
    .from("event_log")
    .select(
      "id, type, domain, difficulty, evidence, retracts_event_id, quest_id, occurred_at",
    )
    .eq("user_id", user.id);

  const events = ((eventRows ?? []) as EventRow[]).map(rowToEvent);

  return (
    <StatusWindowClient
      characterName={profile?.character_name ?? "SUBJECT"}
      title={profile?.title ?? "The Unproven"}
      initialEvents={events}
      initialQuests={(questRows ?? []) as QuestRow[]}
    />
  );
}
