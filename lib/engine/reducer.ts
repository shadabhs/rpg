import { DOMAIN_KEYS, type DomainKey } from "./domains";
import type { SystemEvent } from "./events";
import {
  XP_BY_DIFFICULTY,
  WEEKLY_XP_CAP,
  xpCostForLevel,
  domainGainFromXp,
  INTEGRITY_BASELINE,
  INTEGRITY_GAIN_ON_DECLINE,
  INTEGRITY_GAIN_ON_RETRACT,
  decayFraction,
  tierForState,
} from "./rules";

export type QuestStats = {
  /** A non-voided completion exists in the current local day. */
  doneToday: boolean;
  /** Consecutive local days with a completion, ending today or yesterday —
   *  a streak isn't broken until a full day passes without the deed. */
  streak: number;
  /** Longest run ever. Never resets — per DESIGN.md, history is banked. */
  bestStreak: number;
  totalCompletions: number;
};

export type CharacterState = {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  totalXp: number;
  integrity: number;
  /** Cosmetic currency from loot rolls. Grants nothing, buys nothing
   *  that grants power — per the covenant, forever. */
  gold: number;
  tier: number;
  /** Rust-adjusted values — what the Status Window shows. */
  domains: Record<DomainKey, number>;
  /** Pre-decay values — what decay is computed against. */
  domainsRaw: Record<DomainKey, number>;
  lastActiveAt: string | null;
  daysAbsent: number;
  /** Per-quest streak stats, keyed by quest id. Only quests whose events
   *  carry a questId appear — derived entirely from the log, like
   *  everything else. */
  questStats: Record<string, QuestStats>;
};

/**
 * Local-day key ("2026-08-04") for a moment, shifted by the viewer's UTC
 * offset in minutes. Streaks are about the player's day: a workout at
 * 00:30 IST belongs to the IST date, not the UTC one.
 */
export function localDayKey(
  isoOrDate: string | Date,
  tzOffsetMinutes: number,
): string {
  const t = new Date(isoOrDate).getTime() + tzOffsetMinutes * 60_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Start of the current local day, as a real UTC instant — used server-side
 *  to ask "is there already a completion today?" */
export function localDayStart(now: Date, tzOffsetMinutes: number): Date {
  const shifted = now.getTime() + tzOffsetMinutes * 60_000;
  const floored = Math.floor(shifted / 86_400_000) * 86_400_000;
  return new Date(floored - tzOffsetMinutes * 60_000);
}

const dayNumber = (key: string) => Date.parse(key) / 86_400_000;

/**
 * Everything after the most recent `progress_reset`, which acts as a
 * replay boundary rather than a deletion. Exported because every derived
 * view — the character, the Chronicle, the Ledger, the day/week reports —
 * must agree on where the current life begins.
 */
export function eventsSinceReset(events: SystemEvent[]): SystemEvent[] {
  let boundary = -Infinity;
  for (const e of events) {
    if (e.type === "progress_reset") {
      boundary = Math.max(boundary, new Date(e.timestamp).getTime());
    }
  }
  if (boundary === -Infinity) return events;
  return events.filter((e) => new Date(e.timestamp).getTime() > boundary);
}

/**
 * ISO 8601 week key, e.g. "2026-W05", shifted into the player's local time
 * so the weekly cap resets on THEIR Monday. Bucketing this in UTC while
 * every other boundary was local let a player west of UTC bank two weeks'
 * cap inside one local week, and a player east of it lose the first
 * completions of a fresh local Monday to the previous bucket.
 */
function isoWeekKey(d: Date, tzOffsetMinutes: number): string {
  const shifted = new Date(d.getTime() + tzOffsetMinutes * 60_000);
  const date = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  );
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function totalXpToLevel(totalXp: number): {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
} {
  let level = 1;
  let remaining = totalXp;
  let cost = xpCostForLevel(level);
  while (remaining >= cost) {
    remaining -= cost;
    level += 1;
    cost = xpCostForLevel(level);
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: cost };
}

/**
 * Derive the current character state by replaying the event log. Pure,
 * deterministic, and the only thing allowed to compute XP/level/Integrity —
 * per the AI boundary, nothing here may call an LLM, and reducer.test.ts
 * enforces that with a static check of this file's own source.
 *
 * `now` is injected (not read from Date.now() internally) so decay is
 * testable without mocking the clock.
 */
export function reduce(
  events: SystemEvent[],
  now: Date = new Date(),
  tzOffsetMinutes: number = 0,
): CharacterState {
  // A reset is a replay boundary, not a deletion — see eventsSinceReset.
  const live = eventsSinceReset(events);
  const sorted = [...live].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  // Undone completions are voided entirely: skipped during replay, so their
  // XP, domain gain AND weekly-cap usage unwind to exactly the state that
  // would exist had the tap never happened. Contrast with claim_retracted,
  // which refunds nothing — a misclick is not a claim, so reversing one is
  // bookkeeping, not an honesty event. Only quest_completed is voidable;
  // a retraction pointing at any other event type has no effect.
  const voided = new Set(
    live
      .filter((e) => e.type === "completion_retracted")
      .map((e) => e.retractsEventId),
  );

  const domainsRaw = Object.fromEntries(
    DOMAIN_KEYS.map((k) => [k, 0]),
  ) as Record<DomainKey, number>;

  let totalXp = 0;
  let integrity = INTEGRITY_BASELINE;
  let gold = 0;
  let lastActiveAt: string | null = null;

  const weeklyUsed = new Map<string, number>();
  /** questId → set of local day keys with a non-voided completion. */
  const questDays = new Map<string, Set<string>>();
  const questTotals = new Map<string, number>();
  /** Quests whose NOT YET has already paid Integrity. */
  const declinedQuests = new Set<string>();

  for (const ev of sorted) {
    if (ev.type === "progress_reset") continue; // boundary only, grants nothing
    // A retraction voids the event it names — a mis-tapped completion OR a
    // mis-tapped milestone claim. The action layer restricts claims to a
    // same-day misclick window; older claims exit only through
    // claim_retracted (the honest admission, which refunds nothing).
    // Voiding can never GAIN anything, so this is covenant-safe.
    if (
      (ev.type === "quest_completed" || ev.type === "claim_verified") &&
      voided.has(ev.id)
    ) {
      continue;
    }
    // completion_retracted itself grants nothing and does not count as
    // activity — undoing a misclick is not real-world action, so it never
    // touches lastActiveAt/decay. Its entire effect is the skip above.
    if (ev.type === "completion_retracted") continue;

    if (ev.type === "quest_completed" || ev.type === "claim_verified") {
      const nominal = XP_BY_DIFFICULTY[ev.difficulty];
      const week = isoWeekKey(new Date(ev.timestamp), tzOffsetMinutes);
      const usedSoFar = weeklyUsed.get(week) ?? 0;
      const remaining = Math.max(0, WEEKLY_XP_CAP - usedSoFar);
      const counted = Math.min(nominal, remaining);
      weeklyUsed.set(week, usedSoFar + counted);

      totalXp += counted;
      domainsRaw[ev.domain] += domainGainFromXp(counted);
      lastActiveAt = ev.timestamp;

      if (ev.type === "quest_completed" && ev.questId) {
        if (!questDays.has(ev.questId)) questDays.set(ev.questId, new Set());
        questDays.get(ev.questId)!.add(localDayKey(ev.timestamp, tzOffsetMinutes));
        questTotals.set(ev.questId, (questTotals.get(ev.questId) ?? 0) + 1);
      }
      if (ev.type === "quest_completed") gold += ev.gold ?? 0;
    } else if (ev.type === "claim_declined") {
      // Integrity only. Structurally cannot touch XP, domains, or level —
      // the honesty path is never a worse move than claiming, and never a
      // way to farm progress either.
      //
      // Counted ONCE PER QUEST. Declining the same milestone a second time
      // is not a second act of honesty, and the quest deliberately stays
      // active after a decline — so without this, tapping NOT YET
      // repeatedly was an unbounded Integrity faucet that would have
      // trivialised the Tier V honesty gate. Legacy events carry no
      // questId and are each counted, as they always were.
      if (!ev.questId || !declinedQuests.has(ev.questId)) {
        integrity += INTEGRITY_GAIN_ON_DECLINE;
        if (ev.questId) declinedQuests.add(ev.questId);
      }
      lastActiveAt = ev.timestamp;
    } else if (ev.type === "claim_retracted") {
      // Refunds nothing: the XP from the original claim_verified stands.
      // Only Integrity moves — the honest ledger is worth more than points.
      integrity += INTEGRITY_GAIN_ON_RETRACT;
      lastActiveAt = ev.timestamp;
    }
  }

  const { level, xpIntoLevel, xpForNextLevel } = totalXpToLevel(totalXp);

  const daysAbsent = lastActiveAt
    ? Math.max(
        0,
        Math.floor((now.getTime() - new Date(lastActiveAt).getTime()) / 86400000),
      )
    : 0;
  const rust = decayFraction(daysAbsent);

  // Decay touches domain display values only — level, XP and Integrity are
  // untouched by construction, since rust is applied here, after they've
  // already been computed above.
  const domains = Object.fromEntries(
    DOMAIN_KEYS.map((k) => [k, Math.round(domainsRaw[k] * (1 - rust))]),
  ) as Record<DomainKey, number>;

  // Per-quest streaks, from the day-key sets. A streak survives until a
  // full local day passes with nothing — so it counts back from today if
  // done today, otherwise from yesterday.
  const todayNum = dayNumber(localDayKey(now, tzOffsetMinutes));
  const questStats: Record<string, QuestStats> = {};
  for (const [questId, days] of questDays) {
    const nums = new Set([...days].map(dayNumber));
    const doneToday = nums.has(todayNum);

    let streak = 0;
    let cursor = doneToday ? todayNum : todayNum - 1;
    while (nums.has(cursor)) {
      streak += 1;
      cursor -= 1;
    }

    let bestStreak = 0;
    for (const n of nums) {
      if (nums.has(n - 1)) continue; // only start counting at run starts
      let len = 1;
      while (nums.has(n + len)) len += 1;
      bestStreak = Math.max(bestStreak, len);
    }

    questStats[questId] = {
      doneToday,
      streak,
      bestStreak,
      totalCompletions: questTotals.get(questId) ?? 0,
    };
  }

  return {
    level,
    xpIntoLevel,
    xpForNextLevel,
    totalXp,
    integrity,
    gold,
    tier: tierForState(level, integrity),
    domains,
    domainsRaw,
    lastActiveAt,
    daysAbsent,
    questStats,
  };
}
