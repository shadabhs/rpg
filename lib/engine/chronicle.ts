import type { SystemEvent } from "./events";
import { localDayKey, localDayStart, reduce, eventsSinceReset } from "./reducer";
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
  allEvents: SystemEvent[],
  questTitleById: Record<string, string>,
  tzOffsetMinutes: number,
): ChronicleEntry[] {
  // Every derived view begins at the same place: after the last reset.
  const events = eventsSinceReset(allEvents);
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
      case "claim_verified": {
        // An unprepared claim is stated plainly and without judgement —
        // per DESIGN.md this record IS the only consequence of the honest
        // override, so omitting it made the whole gate consequence-free.
        const base_text = ev.evidence
          ? `Milestone. Evidence: ${ev.evidence}`
          : "Milestone.";
        entries.push({
          ...base,
          tag: "[CLAIMED]",
          text: ev.unprepared
            ? `${base_text} Preparation was not on file.`
            : base_text,
        });
        break;
      }
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
  allEvents: SystemEvent[],
  tzOffsetMinutes: number,
): Ledger {
  const events = eventsSinceReset(allEvents);
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

export type Possession = { item: string; count: number };

/**
 * The inventory, derived: every non-voided drop since the last reset,
 * grouped and counted. Loot with no inventory is a number that scrolls
 * away; a possession is a thing you have.
 */
export function buildPossessions(allEvents: SystemEvent[]): Possession[] {
  const events = eventsSinceReset(allEvents);
  const voided = voidedIds(events);
  const counts = new Map<string, number>();
  for (const ev of events) {
    if (ev.type === "quest_completed" && !voided.has(ev.id) && ev.item) {
      counts.set(ev.item, (counts.get(ev.item) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([item, count]) => ({ item, count }))
    .sort((a, b) => b.count - a.count || a.item.localeCompare(b.item));
}

export type DayReport = {
  /** XP actually banked today — cap-aware, computed as the difference of
   *  two full replays, never nominal-sum arithmetic. */
  xpToday: number;
  completionsToday: number;
};

/** What today amounted to. Powers the close-out ritual. */
export function buildDayReport(
  allEvents: SystemEvent[],
  now: Date,
  tzOffsetMinutes: number,
): DayReport {
  const events = eventsSinceReset(allEvents);
  const dayStartMs = localDayStart(now, tzOffsetMinutes).getTime();
  // The baseline keeps everything from before today PLUS today's
  // retractions. Without the retractions, undoing a completion from an
  // earlier day subtracted from the current replay but not the baseline,
  // and the close-out reported a negative "XP banked today".
  const beforeToday = events.filter(
    (e) =>
      new Date(e.timestamp).getTime() < dayStartMs ||
      e.type === "completion_retracted",
  );
  const xpToday =
    reduce(events, now, tzOffsetMinutes).totalXp -
    reduce(beforeToday, now, tzOffsetMinutes).totalXp;

  const voided = voidedIds(events);
  const todayKey = localDayKey(now, tzOffsetMinutes);
  const completionsToday = events.filter(
    (e) =>
      (e.type === "quest_completed" || e.type === "claim_verified") &&
      !(e.type === "quest_completed" && voided.has(e.id)) &&
      localDayKey(e.timestamp, tzOffsetMinutes) === todayKey,
  ).length;

  return { xpToday, completionsToday };
}

export type WeekReport = {
  /** Real completions in the current local week (Mon-anchored ISO). */
  thisWeek: number;
  /** The best week on record, this one included. */
  bestWeek: number;
  isBestWeek: boolean;
};

/** Monday-anchored local week key, e.g. "2026-W32". */
function weekKey(isoOrDate: string | Date, tzOffsetMinutes: number): string {
  const d = new Date(
    new Date(isoOrDate).getTime() + tzOffsetMinutes * 60_000,
  );
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** This week held against every week before it. The comparison is the
 *  System's entire opinion — no praise, just the two numbers. */
export function buildWeekReport(
  allEvents: SystemEvent[],
  now: Date,
  tzOffsetMinutes: number,
): WeekReport {
  const events = eventsSinceReset(allEvents);
  const voided = voidedIds(events);
  const counts = new Map<string, number>();
  for (const ev of events) {
    if (
      (ev.type === "quest_completed" && !voided.has(ev.id)) ||
      ev.type === "claim_verified"
    ) {
      const wk = weekKey(ev.timestamp, tzOffsetMinutes);
      counts.set(wk, (counts.get(wk) ?? 0) + 1);
    }
  }
  const current = weekKey(now, tzOffsetMinutes);
  const thisWeek = counts.get(current) ?? 0;
  const bestWeek = Math.max(0, ...counts.values());
  return { thisWeek, bestWeek, isBestWeek: thisWeek > 0 && thisWeek >= bestWeek };
}
