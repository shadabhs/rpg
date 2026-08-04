import type { SystemEvent } from "./events";
import { localDayKey } from "./reducer";
import {
  INTEGRITY_GAIN_ON_DECLINE,
  INTEGRITY_GAIN_ON_RETRACT,
} from "./rules";

/**
 * The System's voice, v1 — deterministic. Every line here is a true
 * statement derived from the event log; nothing is fabricated, guessed,
 * or generated. When the AI layer arrives (per the AI boundary in
 * AGENTS.md) it may REPHRASE what these functions derive — it will never
 * add a fact this module didn't compute, and this module stays as pure
 * as the reducer. reducer.test.ts statically checks this file for
 * network I/O, randomness, and AI-client imports on every test run.
 *
 * Tone per AGENTS.md: report reality, never celebrate engagement, no
 * exclamation marks, no encouragement. The player supplies the meaning;
 * the System supplies the mirror.
 */

export type ChronicleEntry = {
  /** Event id — stable key. */
  id: string;
  /** Local day key, for date headers. */
  day: string;
  /** ISO timestamp, for ordering. */
  timestamp: string;
  /** [DONE], [CLAIMED], [HELD BACK], [RETRACTED] */
  tag: string;
  text: string;
};

const voidedIds = (events: SystemEvent[]) =>
  new Set(
    events
      .filter((e) => e.type === "completion_retracted")
      .map((e) => e.retractsEventId),
  );

/**
 * The event log rendered as journal lines, newest first. Deliberately
 * number-free for XP: a capped completion counts for less than its
 * nominal value, and stating the nominal here would be exactly the
 * "confidently wrong number" DESIGN.md forbids. Integrity gains are
 * constants from rules.ts, so those are safe to state.
 */
export function chronicleEntries(
  events: SystemEvent[],
  questTitleById: Record<string, string>,
  tzOffsetMinutes: number,
): ChronicleEntry[] {
  const voided = voidedIds(events);
  const titleOf = (questId?: string) =>
    (questId && questTitleById[questId]) || "a quest";

  const entries: ChronicleEntry[] = [];
  for (const ev of events) {
    const base = {
      id: ev.id,
      day: localDayKey(ev.timestamp, tzOffsetMinutes),
      timestamp: ev.timestamp,
    };
    switch (ev.type) {
      case "quest_completed":
        if (voided.has(ev.id)) break; // undone — it never happened
        entries.push({
          ...base,
          tag: "[DONE]",
          text: ev.item ? `${titleOf(ev.questId)} · ${ev.item}` : titleOf(ev.questId),
        });
        break;
      case "claim_verified":
        entries.push({
          ...base,
          tag: "[CLAIMED]",
          text: ev.evidence
            ? `Milestone. Evidence: ${ev.evidence}`
            : "Milestone.",
        });
        break;
      case "claim_declined":
        entries.push({
          ...base,
          tag: "[HELD BACK]",
          text: `Declined to claim. +${INTEGRITY_GAIN_ON_DECLINE} INTEGRITY.`,
        });
        break;
      case "claim_retracted":
        entries.push({
          ...base,
          tag: "[RETRACTED]",
          text: `A claim withdrawn. +${INTEGRITY_GAIN_ON_RETRACT} INTEGRITY. Nothing refunded.`,
        });
        break;
      case "completion_retracted":
        // The voided completion is dropped above; the retraction itself
        // is bookkeeping, not history worth a line.
        break;
    }
  }

  return entries.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export type Ledger = {
  /** Distinct local days with at least one real completion. */
  daysActive: number;
  /** Non-voided quest completions, ever. */
  questsCompleted: number;
  /** Verified milestone claims, ever. */
  milestonesClaimed: number;
  /** Times NOT YET was chosen — honesty, counted. */
  timesHeldBack: number;
};

/**
 * The Real-World Ledger: totals of real things. Per DESIGN.md this is
 * the intrinsic-motivation anchor — levels are decoration on truth, and
 * these are the truth. Every number is a count of witnessed events.
 */
export function buildLedger(
  events: SystemEvent[],
  tzOffsetMinutes: number,
): Ledger {
  const voided = voidedIds(events);
  const days = new Set<string>();
  let questsCompleted = 0;
  let milestonesClaimed = 0;
  let timesHeldBack = 0;

  for (const ev of events) {
    if (ev.type === "quest_completed" && !voided.has(ev.id)) {
      questsCompleted += 1;
      days.add(localDayKey(ev.timestamp, tzOffsetMinutes));
    } else if (ev.type === "claim_verified") {
      milestonesClaimed += 1;
      days.add(localDayKey(ev.timestamp, tzOffsetMinutes));
    } else if (ev.type === "claim_declined") {
      timesHeldBack += 1;
    }
  }

  return {
    daysActive: days.size,
    questsCompleted,
    milestonesClaimed,
    timesHeldBack,
  };
}
