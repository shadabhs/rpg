import type { DomainKey } from "./domains";
import type { SystemEvent } from "./events";
import type { CharacterState } from "./reducer";

/**
 * Requisites — preparation as a gate. See "Requisites" in DESIGN.md.
 *
 * The governing principle: preparation gates the ATTEMPT, and the gate is
 * honest because in reality it is true. A locked milestone is never
 * unclaimable — the System cannot see your life and must never assert
 * authority over it. It states the shortfall and lets you proceed.
 *
 * Pure and deterministic like the rest of lib/engine: an LLM may one day
 * PROPOSE requisites at Induction, but only this file ever EVALUATES one.
 * reducer.test.ts holds it to the same static purity check as the reducer.
 */

/**
 * Materials are a READOUT of work already logged, never a second grind and
 * never a currency: they are not spent, traded, bought, or decayed.
 * Deliberately the same quantity as the raw (pre-rust) domain stat rather
 * than a parallel economy — "40 Conditioning" literally means "40 raw
 * VITALITY". Real capability is not consumed when you use it, and a
 * spendable material would make a milestone purchasable, which the
 * covenant forbids.
 */
export const MATERIAL_NAMES: Record<DomainKey, string> = {
  vitality: "Conditioning",
  mind: "Insight",
  craft: "Leverage",
  bonds: "Trust",
  spirit: "Stillness",
  virtue: "Standing",
};

export type Requisite =
  | { kind: "material"; domain: DomainKey; amount: number }
  | { kind: "milestone"; questId: string; label: string }
  | { kind: "streak"; questId: string; days: number; label: string };

export type RequisiteStatus = {
  met: boolean;
  /** Full sentence in the System's voice, stating the exact shortfall. */
  text: string;
  have: number;
  need: number;
};

export type RequisiteReport = {
  /** True when there are no requisites, or every one is satisfied. */
  met: boolean;
  statuses: RequisiteStatus[];
  unmetCount: number;
};

/** Quest ids whose milestone claim is on the record. */
function claimedMilestoneIds(events: SystemEvent[]): Set<string> {
  return new Set(
    events
      .filter((e) => e.type === "claim_verified" && e.questId)
      .map((e) => (e as Extract<SystemEvent, { type: "claim_verified" }>).questId!),
  );
}

export function evaluateRequisites(
  requisites: Requisite[] | null | undefined,
  state: CharacterState,
  events: SystemEvent[],
): RequisiteReport {
  if (!requisites || requisites.length === 0) {
    return { met: true, statuses: [], unmetCount: 0 };
  }

  const claimed = claimedMilestoneIds(events);

  const statuses = requisites.map((req): RequisiteStatus => {
    if (req.kind === "material") {
      // Materials never decay, so they read from the RAW domain value —
      // rust is a display concern about recent absence, not a claim that
      // the reps were never done.
      const have = state.domainsRaw[req.domain] ?? 0;
      const met = have >= req.amount;
      return {
        met,
        have,
        need: req.amount,
        text: met
          ? `${req.amount} ${MATERIAL_NAMES[req.domain]} — met.`
          : `Requires ${req.amount} ${MATERIAL_NAMES[req.domain]}. You have ${have}.`,
      };
    }

    if (req.kind === "milestone") {
      const met = claimed.has(req.questId);
      return {
        met,
        have: met ? 1 : 0,
        need: 1,
        text: met
          ? `${req.label} — claimed.`
          : `Requires "${req.label}" first. Not yet claimed.`,
      };
    }

    // Sustained, so it cannot be crammed: the BEST run ever counts, since
    // a streak once genuinely held is capability that was really built.
    const have = state.questStats[req.questId]?.bestStreak ?? 0;
    const met = have >= req.days;
    return {
      met,
      have,
      need: req.days,
      text: met
        ? `${req.days} consecutive days on ${req.label} — met.`
        : `Requires ${req.days} consecutive days on ${req.label}. Your best is ${have}.`,
    };
  });

  const unmetCount = statuses.filter((s) => !s.met).length;
  return { met: unmetCount === 0, statuses, unmetCount };
}
