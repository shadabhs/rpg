"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DomainKey } from "@/lib/engine/domains";
import type { Difficulty } from "@/lib/engine/rules";
import { localDayStart } from "@/lib/engine/reducer";

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

  const { error: insertError } = await supabase.from("event_log").insert({
    user_id: user.id,
    type: "quest_completed",
    domain: quest.domain,
    difficulty: quest.difficulty,
    quest_id: quest.id,
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

  return { ok: true };
}

/** "I HAVE DONE THIS" on the Verification Screen. */
export async function verifyClaim(
  questId: string,
  evidence: string,
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

  const now = new Date().toISOString();

  const { error: insertError } = await supabase.from("event_log").insert({
    user_id: user.id,
    type: "claim_verified",
    domain: quest.domain,
    difficulty: quest.difficulty,
    evidence,
    quest_id: quest.id,
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
    .select("id, status")
    .eq("id", questId)
    .eq("user_id", user.id)
    .single();
  if (fetchError || !quest) return { ok: false, error: "Quest not found." };
  if (quest.status !== "active") return { ok: false, error: "Already resolved." };

  const { error } = await supabase.from("event_log").insert({
    user_id: user.id,
    type: "claim_declined",
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
  if (quest.weighty) {
    return {
      ok: false,
      error: "Verified claims are retracted at the seasonal audit, not undone.",
    };
  }
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
    .in("type", ["quest_completed", "completion_retracted"])
    .order("occurred_at", { ascending: true });
  if (logError) return { ok: false, error: logError.message };

  const alreadyRetracted = new Set(
    (rows ?? [])
      .filter((r) => r.type === "completion_retracted")
      .map((r) => r.retracts_event_id),
  );
  const boundaryMs = localDayStart(new Date(), clampTz(tzOffsetMinutes)).getTime();
  const target = (rows ?? [])
    .reverse()
    .find(
      (r) =>
        r.type === "quest_completed" &&
        !alreadyRetracted.has(r.id) &&
        (!isDaily || new Date(r.occurred_at).getTime() >= boundaryMs),
    );
  if (!target) {
    return {
      ok: false,
      error: isDaily ? "Nothing done today to undo." : "No completion on record to undo.",
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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
