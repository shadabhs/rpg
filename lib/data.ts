/**
 * PHASE 0 — fake data only.
 *
 * No database, no auth, no AI. This file exists purely so the loop can be
 * felt. Everything here is disposable and will be replaced in Phase 1 by
 * a derived-from-event-log character. Nothing should import this after
 * Phase 0.
 */

export type DomainKey =
  | "vitality"
  | "mind"
  | "craft"
  | "bonds"
  | "spirit"
  | "virtue";

export type Domain = {
  key: DomainKey;
  label: string;
  covers: string;
  value: number;
  /** Change over the current season — the trajectory, not the total. */
  trend: number;
  color: string;
};

/**
 * Six domains, maximum. Richness lives at the facet level, never by adding
 * more bars. Integrity is deliberately NOT in this list — it is a meta-stat,
 * never interviewed, and it renders separately.
 */
export const DOMAINS: Domain[] = [
  { key: "vitality", label: "VITALITY", covers: "The body", value: 14, trend: 3, color: "var(--color-vitality)" },
  { key: "mind", label: "MIND", covers: "The inner life", value: 21, trend: 5, color: "var(--color-mind)" },
  { key: "craft", label: "CRAFT", covers: "Work and means", value: 27, trend: 8, color: "var(--color-craft)" },
  { key: "bonds", label: "BONDS", covers: "Everyone else", value: 9, trend: -1, color: "var(--color-bonds)" },
  { key: "spirit", label: "SPIRIT", covers: "Meaning", value: 12, trend: 2, color: "var(--color-spirit)" },
  { key: "virtue", label: "VIRTUE", covers: "Character", value: 8, trend: 1, color: "var(--color-virtue)" },
];

export type Difficulty = "TRIVIAL" | "STANDARD" | "HARD" | "SEVERE";

/**
 * Fixed XP, known before you start. Progress stays an honest mirror —
 * only loot is variable. Declared at creation, never at completion.
 */
export const XP_BY_DIFFICULTY: Record<Difficulty, number> = {
  TRIVIAL: 10,
  STANDARD: 40,
  HARD: 100,
  SEVERE: 250,
};

export type Quest = {
  id: string;
  title: string;
  domain: DomainKey;
  difficulty: Difficulty;
  /** Implementation intention — when and where, not just what. */
  when: string;
  where: string;
  done: boolean;
  /** Milestones and epic completions get the full Verification Screen. */
  weighty?: boolean;
  grants?: string;
};

export const QUESTS: Quest[] = [
  {
    id: "q1",
    title: "Train — lower body",
    domain: "vitality",
    difficulty: "STANDARD",
    when: "06:40",
    where: "Gym on Residency Rd",
    done: false,
  },
  {
    id: "q2",
    title: "Read 20 pages",
    domain: "mind",
    difficulty: "TRIVIAL",
    when: "Before sleep",
    where: "Bed, phone in the other room",
    done: false,
  },
  {
    id: "q3",
    title: "Call Abba",
    domain: "bonds",
    difficulty: "STANDARD",
    when: "20:00",
    where: "Balcony",
    done: false,
  },
  {
    id: "q4",
    title: "Ship the pricing page",
    domain: "craft",
    difficulty: "HARD",
    when: "09:00–12:00",
    where: "Desk, notifications off",
    done: false,
  },
  {
    id: "q5",
    title: "Ten minutes, no input",
    domain: "spirit",
    difficulty: "TRIVIAL",
    when: "07:30",
    where: "Chair by the window",
    done: false,
  },
  {
    id: "q6",
    title: "MILESTONE — Beta shipped to first 10 users",
    domain: "craft",
    difficulty: "SEVERE",
    when: "This week",
    where: "—",
    done: false,
    weighty: true,
    grants: "Level 6, +3 Craft, [Founder's Signet]",
  },
];

/**
 * The Real-World Ledger. Per DESIGN.md this is the guardrail against
 * extrinsic rewards crowding out intrinsic motivation: what actually
 * changed, stated plainly. Levels are decoration on truth.
 */
export const LEDGER = [
  { value: "34", unit: "sessions trained", note: "this season" },
  { value: "9", unit: "books finished", note: "this year" },
  { value: "12", unit: "calls home", note: "was 3 last season" },
  { value: "187", unit: "days logged", note: "since Induction" },
];

export const CHARACTER = {
  name: "SUBJECT",
  title: "The Unproven",
  level: 5,
  xpIntoLevel: 180,
  xpForLevel: 400,
  /** Neutral baseline. Only ever rises, never falls. */
  integrity: 12,
  /** Tier I–IV gate on level. Tier V additionally requires Integrity. */
  tier: 1,
  daysAbsent: 0,
};

export const TIER_NAMES = [
  "UNPROVEN",
  "AWAKENED",
  "TEMPERED",
  "ASCENDANT",
  "SOVEREIGN",
] as const;

/** Tier V is gated on honesty, not power. */
export const TIER_V_INTEGRITY_REQUIRED = 80;
