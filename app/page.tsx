import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  rowToEvent,
  type EventRow,
  type QuestRow,
  type EpicRow,
} from "@/db/mappers";
import { StatusWindowClient } from "@/components/StatusWindowClient";

/**
 * The Status Window. Server Component: fetches the authenticated user's
 * real data and hands it to the client component that owns the
 * interactive/animated UI. lib/data.ts (Phase 0's fake data) is gone —
 * this is what replaced it.
 *
 * Explicitly uncacheable, twice over (alongside the no-store fetch in
 * lib/supabase/server.ts): the character IS the event log, so a cached
 * render is a wrong character. Live QA caught exactly that — stale
 * totals surviving hard reloads.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
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

  const { data: epicRows, error: epicsError } = await supabase
    .from("epics")
    .select("id, title, intent, domain, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const { data: questRows, error: questsError } = await supabase
    .from("quests")
    .select(
      "id, epic_id, title, domain, difficulty, when_text, where_text, weighty, cadence, requisites, grants, status",
    )
    .eq("user_id", user.id)
    // Archived quests are retired — a reset archives everything, and
    // without this filter they kept rendering as struck-through rows, so
    // a reset that HAD worked in the database looked like it hadn't.
    .neq("status", "archived")
    .order("created_at", { ascending: true });

  const { data: eventRows, error: eventsError } = await supabase
    .from("event_log")
    .select(
      "id, type, domain, difficulty, evidence, retracts_event_id, quest_id, gold, item, unprepared, occurred_at",
    )
    .eq("user_id", user.id);

  // A failed read must fail LOUDLY. Swallowing it and rendering a fresh
  // Level-1 character would show the player a confidently wrong state —
  // "your history is gone" — when nothing was lost. The classic cause is
  // a deploy whose selects name columns from a migration that hasn't been
  // applied yet; the message below states exactly that.
  const readFault = epicsError ?? questsError ?? eventsError;
  if (readFault) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4">
        <div className="w-full border border-rust/40 bg-panel/60 px-5 py-6">
          <p className="font-sys text-[11px] tracking-[0.34em] text-rust">
            [ FAULT ]
          </p>
          <p className="mt-4 font-sys text-[13px] leading-relaxed text-ink-dim">
            The System cannot read its own record.
            <br />
            Nothing has been erased — this is an infrastructure fault, not
            data loss.
          </p>
          <p className="mt-4 border-l-2 border-rust/40 pl-3 font-sys text-[11px] leading-relaxed text-ink-faint">
            {readFault.message}
          </p>
          <p className="mt-4 font-sys text-[11px] leading-relaxed text-ink-faint">
            If this mentions a missing column or table, a database migration
            in <span className="text-ink-dim">db/migrations/</span> has not
            been applied yet.
          </p>
        </div>
      </main>
    );
  }

  const events = ((eventRows ?? []) as EventRow[]).map(rowToEvent);

  return (
    <StatusWindowClient
      characterName={profile?.character_name ?? "SUBJECT"}
      title={profile?.title ?? "The Unproven"}
      initialEvents={events}
      initialQuests={(questRows ?? []) as QuestRow[]}
      initialEpics={(epicRows ?? []) as EpicRow[]}
    />
  );
}
