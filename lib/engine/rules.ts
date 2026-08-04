/**
 * THE SYSTEM — game rules.
 *
 * Deterministic, versioned config. Per AGENTS.md: "AI writes the story,
 * deterministic code writes the numbers." Nothing in this file or in
 * reducer.ts may depend on network I/O, randomness, or an LLM —
 * reducer.test.ts statically checks the source of both files for exactly
 * that, so this guarantee doesn't rot silently as the code changes.
 *
 * These are Phase 1's first real numbers, resolving the "XP curve and level
 * thresholds" item DESIGN.md flagged as needed by this phase. They're
 * isolated in this one file on purpose — DESIGN.md's Phase 2 plan moves
 * balance config to versioned DB rows so "balance tweaks must not require a
 * deploy"; keeping every tunable number here now makes that a relocation,
 * not a rewrite.
 */

export type Difficulty = "TRIVIAL" | "STANDARD" | "HARD" | "SEVERE";

/**
 * Fixed XP, known before a quest is started. Progress stays an honest
 * mirror — only loot is ever variable. Values carried over from the Phase 0
 * placeholder for continuity.
 */
export const XP_BY_DIFFICULTY: Record<Difficulty, number> = {
  TRIVIAL: 10,
  STANDARD: 40,
  HARD: 100,
  SEVERE: 250,
};

/**
 * Weekly XP ceiling — the covenant rule that trivial quests can't be
 * farmed. Sized against a genuinely active day (five quests spanning
 * Trivial through Hard, ~200 XP) across a full week: real daily use tops
 * out around 1,400 XP/week and sits comfortably under this cap, while
 * spamming dozens of Trivials for free progress does not.
 */
export const WEEKLY_XP_CAP = 1500;

/**
 * XP required, while AT `level`, to reach `level + 1`. Deliberately steep
 * — "Level 1 must feel weak" per DESIGN.md — so each level demands
 * visibly more than the last rather than flattening out.
 */
export function xpCostForLevel(level: number): number {
  return Math.round(60 * Math.pow(level, 1.5));
}

/** Quest XP → domain stat gain. Matches the Phase 0 placeholder's formula,
 *  kept identical so nothing about the feel changes between phases. */
export function domainGainFromXp(xp: number): number {
  return Math.max(1, Math.round(xp / 20));
}

/** Neutral baseline. Integrity is never interviewed and only ever rises. */
export const INTEGRITY_BASELINE = 10;

/** Choosing NOT YET on the Verification Screen. */
export const INTEGRITY_GAIN_ON_DECLINE = 4;

/** Retracting a claim during the seasonal self-audit — a bigger admission
 *  than declining up front, since the XP from it was already banked and
 *  is NOT refunded. Weighted slightly higher for that reason. */
export const INTEGRITY_GAIN_ON_RETRACT = 6;

/**
 * Decay: "Nothing for 3 days. Gentle rust after 7. Capped ~15%, never lose
 * a level permanently." Computed LIVE from time-since-last-activity in the
 * reducer — it is never written as an event, so by construction it can
 * never touch XP, level, or Integrity (see reduce() in reducer.ts).
 */
export const DECAY_GRACE_DAYS = 3;
export const DECAY_DAILY_RATE = 0.025;
export const DECAY_CAP = 0.15;

export function decayFraction(daysAbsent: number): number {
  if (daysAbsent <= DECAY_GRACE_DAYS) return 0;
  const rusted = (daysAbsent - DECAY_GRACE_DAYS) * DECAY_DAILY_RATE;
  return Math.min(DECAY_CAP, rusted);
}

/** Tier I–IV gate on level; Tier V additionally requires Integrity — the
 *  honesty system made permanently visible on the avatar. */
export const TIER_LEVEL_THRESHOLDS = [1, 10, 20, 35, 50];
export const TIER_V_INTEGRITY_REQUIRED = 80;

export const TIER_NAMES = [
  "UNPROVEN",
  "AWAKENED",
  "TEMPERED",
  "ASCENDANT",
  "SOVEREIGN",
] as const;

export function tierForState(level: number, integrity: number): number {
  let tier = 1;
  for (let i = TIER_LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (level >= TIER_LEVEL_THRESHOLDS[i]) {
      tier = i + 1;
      break;
    }
  }
  if (tier >= 5 && integrity < TIER_V_INTEGRITY_REQUIRED) {
    tier = 4;
  }
  return tier;
}
