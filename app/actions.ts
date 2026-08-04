"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DomainKey } from "@/lib/engine/domains";
import type { Difficulty } from "@/lib/engine/rules";
import { localDayStart, reduce } from "@/lib/engine/reducer";
import { rowToEvent, type EventRow } from "@/db/mappers";
import { rollLoot } from "@/lib/loot";
import { selectableTitles } from "@/lib/engine/titles";
import { evaluateRequisites, type Requisite } from "@/lib/engine/requisites";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Clamp a client-supplied UTC offset to the real range (±14h). The offset
 *  only moves day boundaries for daily-quest bookkeeping — worst case a
 *  manipulated offset squeezes in one extra completion around midnight,
 *  which the weekly XP cap already bounds. Not a trust surface. */
function clampTz(tzOffsetMinutes: number): number {
  if (!Number.isFinite(tzOffsetMinutes)) return 0;
  return Math.max(-840, Math.min(840, Math.round(tzOffsetMinutes)));
}

/**
 * Every mutation below re-derives the acting user from the session
 * server-side via supabase.auth.getUser() — never from a client-supplied
 * id — and lets RLS (db/policies.sql) be the final word on row ownership.
 * This file is the entire write surface for progression. Per the AI
 * boundary in AGENTS.md, nothing here or in lib/engine may be reachable
 * from an AI code path; these are the only functions allowed to insert
 * into event_log.
 */

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** One-tap completion. Never used for weighty quests — those go through
 *  verifyClaim/declineClaim instead, enforced below. A 'daily' quest stays
 *  active forever; "done today" is derived from the event log, which is
 *  what makes streaks computable from the log alone. */
export async function completeQuest(
  questId: string,
  tzOffsetMinutes: number = 0,
): Promise<ActionResult & { gold?: number; item?: string | null }> {
  const { supabase, user } = await requireUser();

  const { data: quest, error: fetchError } = await supabase
    .from("quests")
    .select("*")
    .eq("id", questId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !quest) return { ok: false, error: "Quest not found." };
  if (quest.status !== "active") return { ok: false, error: "Already resolved." };
  if (quest.weighty) {
    return { ok: false, error: "Milestones require verification, not a tap." };
  }

  const isDaily = quest.cadence === "daily";
  if (isDaily) {
    const boundary = localDayStart(new Date(), clampTz(tzOffsetMinutes)).toISOString();
    const { data: todays, error: todayError } = await supabase
      .from("event_log")
      .select("id, type, retracts_event_id")
      .eq("user_id", user.id)
      .eq("quest_id", questId)
      .gte("occurred_at", boundary);
    if (todayError) return { ok: false, error: todayError.message };
    const undone = new Set(
      (todays ?? [])
        .filter((r) => r.type === "completion_retracted")
        .map((r) => r.retracts_event_id),
    );
    const alreadyDone = (todays ?? []).some(
      (r) => r.type === "quest_completed" && !undone.has(r.id),
    );
    if (alreadyDone) return { ok: false, error: "Already done today." };
  }

  const now = new Date().toISOString();

  // Fixed XP, variable loot: the roll happens HERE, once, server-side,
  // and the result is stored on the event. The reducer only ever replays
  // what was rolled — chance never re-enters, and undo voids the loot
  // together with the completion.
  const loot = rollLoot(quest.difficulty);

  const { error: insertError } = await supabase.from("event_log").insert({
    user_id: user.id,
    type: "quest_completed",
    domain: quest.domain,
    difficulty: quest.difficulty,
    quest_id: quest.id,
    gold: loot.gold,
    item: loot.item,
    occurred_at: now,
  });
  if (insertError) return { ok: false, error: insertError.message };

  if (!isDaily) {
    const { error: updateError } = await supabase
      .from("quests")
      .update({ status: "completed", completed_at: now })
      .eq("id", questId)
      .eq("user_id", user.id);
    if (updateError) return { ok: false, error: updateError.message };
  }

  return { ok: true, gold: loot.gold, item: loot.item };
}

/**
 * "I HAVE DONE THIS" on the Verification Screen.
 *
 * Requisites never block this. Per DESIGN.md, the System cannot see your
 * life and must not assert authority over it — someone who trained
 * elsewhere for a year would otherwise be called a liar by a database.
 * An unmet-requisite claim grants FULL XP and costs no Integrity; it is
 * merely recorded as unprepared so the Chronicle stays accurate. The flag
 * is re-derived server-side rather than trusted from the client.
 */
export async function verifyClaim(
  questId: string,
  evidence: string,
  tzOffsetMinutes: number = 0,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const { data: quest, error: fetchError } = await supabase
    .from("quests")
    .select("*")
    .eq("id", questId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !quest) return { ok: false, error: "Quest not found." };
  if (quest.status !== "active") return { ok: false, error: "Already resolved." };
  // The mirror of completeQuest's weighty check. Without it this path was
  // the weaker of the two: verifying a DAILY awarded XP again on a day it
  // was already completed, bypassing the once-per-day guard entirely, and
  // left the quest stuck in 'completed' where neither tap nor undo could
  // reach it.
  if (!quest.weighty) {
    return { ok: false, error: "Only milestones are claimed. Tap this one." };
  }

  const now = new Date().toISOString();

  // Re-derive preparedness from the log rather than trusting the client.
  let unprepared = false;
  if (Array.isArray(quest.requisites) && quest.requisites.length > 0) {
    const { data: eventRows, error: readError } = await supabase
      .from("event_log")
      .select(
        "id, type, domain, difficulty, evidence, retracts_event_id, quest_id, gold, item, unprepared, occurred_at",
      )
      .eq("user_id", user.id);
    if (readError) return { ok: false, error: readError.message };
    const events = ((eventRows ?? []) as EventRow[]).map(rowToEvent);
    // Same timezone the UI evaluated with, so a streak requisite the
    // screen showed as met is never recorded as unprepared (or vice versa).
    unprepared = !evaluateRequisites(
      quest.requisites as Requisite[],
      reduce(events, new Date(), clampTz(tzOffsetMinutes)),
      events,
    ).met;
  }

  const { error: insertError } = await supabase.from("event_log").insert({
    user_id: user.id,
    type: "claim_verified",
    domain: quest.domain,
    difficulty: quest.difficulty,
    evidence,
    quest_id: quest.id,
    unprepared,
    occurred_at: now,
  });
  if (insertError) return { ok: false, error: insertError.message };

  const { error: updateError } = await supabase
    .from("quests")
    .update({ status: "completed", completed_at: now })
    .eq("id", questId)
    .eq("user_id", user.id);
  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true };
}

/**
 * "NOT YET". Grants Integrity, per the honesty system — this is the one
 * event type where declining is the rewarded move. The quest deliberately
 * stays active: declining is not a completion, and not a deletion either.
 */
export async function declineClaim(questId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const { data: quest, error: fetchError } = await supabase
    .from("quests")
    .select("id, status, weighty")
    .eq("id", questId)
    .eq("user_id", user.id)
    .single();
  if (fetchError || !quest) return { ok: false, error: "Quest not found." };
  if (quest.status !== "active") return { ok: false, error: "Already resolved." };
  if (!quest.weighty) {
    return { ok: false, error: "Only milestones are claimed." };
  }

  // One decline per quest. The quest stays active after NOT YET by design,
  // so without this the honesty button itself was an unbounded Integrity
  // faucet — ~20 seconds of tapping would clear the Tier V gate that
  // exists to make fabricated progress visibly hollow. The reducer
  // independently de-duplicates on replay; this just avoids writing the
  // dead event.
  const { data: priorDeclines, error: priorError } = await supabase
    .from("event_log")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", "claim_declined")
    .eq("quest_id", questId)
    .limit(1);
  if (priorError) return { ok: false, error: priorError.message };
  if (priorDeclines && priorDeclines.length > 0) {
    return { ok: false, error: "Already held back on this. Nothing further to record." };
  }

  const { error } = await supabase.from("event_log").insert({
    user_id: user.id,
    type: "claim_declined",
    quest_id: questId,
    occurred_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/**
 * The misclick undo. Appends a completion_retracted event — history is
 * never edited or deleted, the log stays append-only — and the reducer
 * voids the referenced completion entirely, so XP, domain gain and
 * weekly-cap usage all return to exactly what they'd be had the tap never
 * happened. No covenant risk: undo only ever removes progress.
 *
 * Weighty quests are refused on purpose — a verified claim is an honesty
 * event, and the only exit from one is claim_retracted at the seasonal
 * audit, which refunds nothing.
 */
export async function undoCompletion(
  questId: string,
  tzOffsetMinutes: number = 0,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const { data: quest, error: fetchError } = await supabase
    .from("quests")
    .select("id, weighty, status, cadence")
    .eq("id", questId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !quest) return { ok: false, error: "Quest not found." };
  const isDaily = quest.cadence === "daily";
  // A daily quest never leaves 'active', so status can't gate its undo; a
  // once quest must actually be completed.
  if (!isDaily && quest.status !== "completed") {
    return { ok: false, error: "Nothing to undo." };
  }

  // Latest completion for this quest that hasn't already been retracted.
  // Resolved server-side from the log — the client's optimistic event ids
  // never match the database's, so it can't be trusted to name the row.
  // For dailies only today's completion is undoable: a misclick is noticed
  // today, and un-writing an older day would silently rewrite streak
  // history.
  const { data: rows, error: logError } = await supabase
    .from("event_log")
    .select("id, type, retracts_event_id, occurred_at")
    .eq("user_id", user.id)
    .eq("quest_id", questId)
    .in("type", ["quest_completed", "claim_verified", "completion_retracted"])
    .order("occurred_at", { ascending: true });
  if (logError) return { ok: false, error: logError.message };

  const alreadyRetracted = new Set(
    (rows ?? [])
      .filter((r) => r.type === "completion_retracted")
      .map((r) => r.retracts_event_id),
  );
  // The later of the local day start and 24h ago. The tz offset is
  // client-supplied, and a hostile -840 would otherwise push the boundary
  // ~22h earlier — silently rewriting a PREVIOUS day's streak history,
  // which this restriction exists to prevent. A real local day start is
  // never more than 24h back, so honest clients are unaffected.
  const boundaryMs = Math.max(
    localDayStart(new Date(), clampTz(tzOffsetMinutes)).getTime(),
    Date.now() - 86_400_000,
  );
  // A milestone claim is a solemn statement, so it gets a MISCLICK WINDOW
  // rather than open-ended undo: today only, same as a daily. Beyond that
  // it is history, and the only exit is claim_retracted — the honest
  // admission, which grants Integrity and refunds nothing. Before this
  // there was no exit at all, which made a mis-tap permanent; a trap is
  // not the same thing as a principle.
  const windowed = isDaily || quest.weighty;
  const target = (rows ?? [])
    .reverse()
    .find(
      (r) =>
        (r.type === "quest_completed" || r.type === "claim_verified") &&
        !alreadyRetracted.has(r.id) &&
        (!windowed || new Date(r.occurred_at).getTime() >= boundaryMs),
    );
  if (!target) {
    return {
      ok: false,
      error: quest.weighty
        ? "Claimed before today. It stands — retract it at the seasonal audit."
        : isDaily
          ? "Nothing done today to undo."
          : "No completion on record to undo.",
    };
  }

  const { error: insertError } = await supabase.from("event_log").insert({
    user_id: user.id,
    type: "completion_retracted",
    retracts_event_id: target.id,
    quest_id: questId,
    occurred_at: new Date().toISOString(),
  });
  if (insertError) return { ok: false, error: insertError.message };

  if (!isDaily) {
    const { error: updateError } = await supabase
      .from("quests")
      .update({ status: "active", completed_at: null })
      .eq("id", questId)
      .eq("user_id", user.id);
    if (updateError) return { ok: false, error: updateError.message };
  }

  return { ok: true };
}

/** The first-run rite: the player states their name. Cosmetic identity
 *  only — nothing numeric moves here. */
export async function setCharacterName(name: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const trimmed = name.trim().toUpperCase();
  if (!trimmed) return { ok: false, error: "A name is required." };
  if (trimmed.length > 24) return { ok: false, error: "Twenty-four characters at most." };

  const { error } = await supabase
    .from("profiles")
    .update({ character_name: trimmed })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/**
 * Wear an earned title. Validated server-side: the entitlement is
 * recomputed from the event log, so the client can request any string it
 * likes and only ever wear what the record supports.
 */
export async function chooseTitle(titleName: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const { data: eventRows, error: readError } = await supabase
    .from("event_log")
    .select(
      "id, type, domain, difficulty, evidence, retracts_event_id, quest_id, gold, item, unprepared, occurred_at",
    )
    .eq("user_id", user.id);
  if (readError) return { ok: false, error: readError.message };

  const events = ((eventRows ?? []) as EventRow[]).map(rowToEvent);
  const state = reduce(events);
  const allowed = selectableTitles(state, events);
  if (!allowed.includes(titleName)) {
    return { ok: false, error: "That title has not been earned." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ title: titleName })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/** Declare an epic — a named long-term goal quests can belong to. Grants
 *  nothing on its own: an epic is a container, and only the real actions
 *  inside it move any number. */
export async function createEpic(input: {
  title: string;
  intent: string;
  domain: DomainKey;
}): Promise<ActionResult & { id?: string }> {
  const { supabase, user } = await requireUser();
  if (!input.title.trim()) return { ok: false, error: "An epic needs a name." };

  const { data, error } = await supabase
    .from("epics")
    .insert({
      user_id: user.id,
      title: input.title.trim(),
      intent: input.intent.trim() || null,
      domain: input.domain,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Insert failed." };
  return { ok: true, id: data.id };
}

export type NewQuestInput = {
  epicId?: string | null;
  title: string;
  domain: DomainKey;
  difficulty: Difficulty;
  whenText: string;
  whereText: string;
  weighty: boolean;
  cadence: "once" | "daily";
  grants?: string;
};

/** Difficulty is fixed here and never edited after — declared before
 *  completion, never inflated after, per the covenant. */
export async function createQuest(
  input: NewQuestInput,
): Promise<ActionResult & { id?: string }> {
  const { supabase, user } = await requireUser();

  if (!input.title.trim()) return { ok: false, error: "A quest needs a title." };
  if (!input.whenText.trim() || !input.whereText.trim()) {
    return { ok: false, error: "When and where are not optional." };
  }

  // An epic_id is only honoured if that epic really belongs to the acting
  // user — never trust a client-supplied foreign key.
  let epicId: string | null = null;
  if (input.epicId) {
    const { data: epic } = await supabase
      .from("epics")
      .select("id")
      .eq("id", input.epicId)
      .eq("user_id", user.id)
      .single();
    if (!epic) return { ok: false, error: "Epic not found." };
    epicId = epic.id;
  }

  const { data, error } = await supabase
    .from("quests")
    .insert({
      user_id: user.id,
      epic_id: epicId,
      title: input.title.trim(),
      domain: input.domain,
      difficulty: input.difficulty,
      when_text: input.whenText.trim(),
      where_text: input.whereText.trim(),
      weighty: input.weighty,
      // A milestone is claimed once, by definition — it can never recur.
      cadence: input.weighty ? "once" : input.cadence,
      grants: input.weighty ? (input.grants?.trim() ?? null) : null,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Insert failed." };
  return { ok: true, id: data.id };
}

/**
 * [ SYSTEM CONFIGURATION ] — wipe progress and begin again.
 *
 * Cannot and must not delete: `event_log` has no DELETE policy for any
 * role, which is exactly what makes the honesty system's audit trail
 * provable. Instead this appends a `progress_reset` event, which the
 * reducer treats as a REPLAY BOUNDARY — the character starts over while
 * the history behind it stays on record. Quests are archived rather than
 * removed, for the same reason.
 *
 * Requires the literal string "RESET" from a deliberate, typed
 * confirmation. Re-checked here because a client-side guard is a
 * convenience, never a control.
 */
export async function resetProgress(confirmation: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  if (confirmation.trim().toUpperCase() !== "RESET") {
    return { ok: false, error: "Confirmation not given. Nothing was changed." };
  }

  const { error: insertError } = await supabase.from("event_log").insert({
    user_id: user.id,
    type: "progress_reset",
    occurred_at: new Date().toISOString(),
  });
  if (insertError) return { ok: false, error: insertError.message };

  // Archive every quest so the board is clear. `status` is one of the two
  // columns the client role may update (db/policies.sql).
  const { error: questError } = await supabase
    .from("quests")
    .update({ status: "archived" })
    .eq("user_id", user.id)
    .neq("status", "archived");
  if (questError) return { ok: false, error: questError.message };

  // Back to an unnamed subject, so the first-run rite greets you again.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ character_name: "SUBJECT", title: "The Unproven" })
    .eq("user_id", user.id);
  if (profileError) return { ok: false, error: profileError.message };

  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
