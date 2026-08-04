/**
 * The six life domains, and only the six. Deliberately a separate
 * definition from the one in `lib/data.ts` rather than importing it — the
 * engine must have zero dependency on Phase 0's disposable fake data, so
 * this is its own source of truth going forward. See AGENTS.md: "Six
 * domains, maximum."
 */

export type DomainKey =
  | "vitality"
  | "mind"
  | "craft"
  | "bonds"
  | "spirit"
  | "virtue";

export const DOMAIN_KEYS: DomainKey[] = [
  "vitality",
  "mind",
  "craft",
  "bonds",
  "spirit",
  "virtue",
];

/**
 * Display metadata — label, description, colour. This is permanent
 * presentation config, not placeholder content, so it lives here rather
 * than in the disposable lib/data.ts.
 */
export const DOMAIN_DISPLAY: Record<
  DomainKey,
  { label: string; covers: string; color: string }
> = {
  vitality: { label: "VITALITY", covers: "The body", color: "var(--color-vitality)" },
  mind: { label: "MIND", covers: "The inner life", color: "var(--color-mind)" },
  craft: { label: "CRAFT", covers: "Work and means", color: "var(--color-craft)" },
  bonds: { label: "BONDS", covers: "Everyone else", color: "var(--color-bonds)" },
  spirit: { label: "SPIRIT", covers: "Meaning", color: "var(--color-spirit)" },
  virtue: { label: "VIRTUE", covers: "Character", color: "var(--color-virtue)" },
};

/**
 * The shape StatBar renders. `trend` (change over the current season) is
 * optional and omitted entirely until seasons exist (Phase 2) — showing a
 * fabricated "+0" for a season that doesn't exist yet would be exactly the
 * "confidently wrong number" DESIGN.md's Measures section warns against.
 */
export type DomainDisplayState = {
  key: DomainKey;
  label: string;
  covers: string;
  color: string;
  value: number;
  trend?: number;
};
