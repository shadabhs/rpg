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

/**
 * Quest XP → domain stat gain.
 *
 * The zero case is load-bearing: once the weekly ceiling is spent, a
 * completion banks 0 XP and must therefore grant 0 domain progress. An
 * earlier version floored this at 1, which meant the cap held for XP but
 * not for domain bars — and since Requisite materials read the raw domain
 * value, trivial quests could be farmed past a gate while earning nothing.
 * That is precisely the farming the covenant's weekly ceiling exists to
 * prevent. The floor of 1 still applies to any real, uncapped award, so a
 * TRIVIAL quest is never worth nothing.
 */
export function domainGainFromXp(xp: number): number {
  if (xp <= 0) return 0;
  return Math.max(1, Math.round(xp / 20));
}

/**
 * Loot — the garnish. Per the covenant: FIXED XP, VARIABLE LOOT. XP is
 * the honest mirror and is never random; gold and drops are decoration,
 * grant no power, and are the only place chance is allowed to live.
 *
 * These tables are pure data. The actual roll — the one place chance is
 * allowed — lives in lib/loot.ts, OUTSIDE the engine: the reducer only
 * ever replays the rolled result stored on the event, so replay stays
 * deterministic and this file passes the static purity check.
 *
 * Tolerance guard per DESIGN.md: magnitudes are capped and do not
 * escalate with progression.
 */
export const GOLD_BY_DIFFICULTY: Record<Difficulty, { min: number; max: number }> = {
  TRIVIAL: { min: 1, max: 3 },
  STANDARD: { min: 3, max: 8 },
  HARD: { min: 8, max: 20 },
  SEVERE: { min: 20, max: 50 },
};

export const DROP_CHANCE_BY_DIFFICULTY: Record<Difficulty, number> = {
  TRIVIAL: 0.02,
  STANDARD: 0.06,
  HARD: 0.12,
  SEVERE: 0.25,
};

/** Flavour items. Cosmetic, powerless, and worded so they honour the
 *  effort rather than flatter the player. */
export const ITEM_TABLE: Record<Difficulty, string[]> = {
  TRIVIAL: ["Rust-flecked Token", "Bent Copper Pin", "Worn Bootlace"],
  STANDARD: ["Field-Stitched Band", "Quenched Iron Nail", "Traveller's Chalk"],
  HARD: ["Oath-Marked Coin", "Tempered Buckle", "Cartographer's Stub"],
  SEVERE: ["Sigil of the Long Road", "Coldforged Clasp", "Witness Stone"],
};

/** One line per item, shown in Possessions. The System's register: each
 *  marks a real morning, never flatters. */
export const ITEM_LORE: Record<string, string> = {
  "Rust-flecked Token": "It proves nothing. It marks a day you showed up.",
  "Bent Copper Pin": "Bent, kept anyway.",
  "Worn Bootlace": "Worn through by use, which is the only honest way.",
  "Field-Stitched Band": "Mended in the field, mid-effort.",
  "Quenched Iron Nail": "Hardened by being put through it.",
  "Traveller's Chalk": "For marking a route you actually walked.",
  "Oath-Marked Coin": "Struck the day a word was kept.",
  "Tempered Buckle": "Held under strain. Still holds.",
  "Cartographer's Stub": "The pencil that mapped unfamiliar ground.",
  "Sigil of the Long Road": "Given for distance, not speed.",
  "Coldforged Clasp": "Made without heat, the hard way.",
  "Witness Stone": "It was there when the difficult thing was done.",
};

/** What each material line under the domains means, stated once. */
export const MATERIAL_LORE =
  "Materials are earned by doing and are never spent. A gate asks whether you have them, not for them.";

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

/**
 * Progressive disclosure: which System modules exist at which level. A
 * new subject sees only TODAY, STATUS and SYSTEM; the campaign layer and
 * the archive REVEAL themselves at Level 2 — the interface itself grows
 * through play, and a level visibly grants something. Purely
 * informational gating: no XP or data is ever locked, only surfaces.
 */
export const MODULE_UNLOCK_LEVELS = {
  status: 1,
  today: 1,
  campaign: 2,
  chronicle: 2,
  system: 1,
} as const;

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
