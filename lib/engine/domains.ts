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
