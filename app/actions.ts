"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DomainKey } from "@/lib/engine/domains";
import type { Difficulty } from "@/lib/engine/rules";

type ActionResult = { ok: true } | { ok: false; error: string };

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

/** One-tap daily completion. Never used for weighty quests — those go
 *  through verifyClaim/declineClaim instead, enforced below. */
export async function completeQuest(questId: string): Promise<ActionResult> {
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

  const now = new Date().toISOString();

  const { error: insertError } = await supabase.from("event_log").insert({
    user_id: user.id,
    type: "quest_completed",
    domain: quest.domain,
    difficulty: quest.difficulty,
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

export type NewQuestInput = {
  title: string;
  domain: DomainKey;
  difficulty: Difficulty;
  whenText: string;
  whereText: string;
  weighty: boolean;
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

  const { data, error } = await supabase
    .from("quests")
    .insert({
      user_id: user.id,
      title: input.title.trim(),
      domain: input.domain,
      difficulty: input.difficulty,
      when_text: input.whenText.trim(),
      where_text: input.whereText.trim(),
      weighty: input.weighty,
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
