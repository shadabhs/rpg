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

export type CharacterState = {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  totalXp: number;
  integrity: number;
  tier: number;
  /** Rust-adjusted values — what the Status Window shows. */
  domains: Record<DomainKey, number>;
  /** Pre-decay values — what decay is computed against. */
  domainsRaw: Record<DomainKey, number>;
  lastActiveAt: string | null;
  daysAbsent: number;
};

/** ISO 8601 week key (UTC), e.g. "2026-W05". Used to bucket the weekly cap. */
function isoWeekKey(d: Date): string {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
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
): CharacterState {
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const domainsRaw = Object.fromEntries(
    DOMAIN_KEYS.map((k) => [k, 0]),
  ) as Record<DomainKey, number>;

  let totalXp = 0;
  let integrity = INTEGRITY_BASELINE;
  let lastActiveAt: string | null = null;

  const weeklyUsed = new Map<string, number>();

  for (const ev of sorted) {
    if (ev.type === "quest_completed" || ev.type === "claim_verified") {
      const nominal = XP_BY_DIFFICULTY[ev.difficulty];
      const week = isoWeekKey(new Date(ev.timestamp));
      const usedSoFar = weeklyUsed.get(week) ?? 0;
      const remaining = Math.max(0, WEEKLY_XP_CAP - usedSoFar);
      const counted = Math.min(nominal, remaining);
      weeklyUsed.set(week, usedSoFar + counted);

      totalXp += counted;
      domainsRaw[ev.domain] += domainGainFromXp(counted);
      lastActiveAt = ev.timestamp;
    } else if (ev.type === "claim_declined") {
      // Integrity only. Structurally cannot touch XP, domains, or level —
      // the honesty path is never a worse move than claiming, and never a
      // way to farm progress either.
      integrity += INTEGRITY_GAIN_ON_DECLINE;
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

  return {
    level,
    xpIntoLevel,
    xpForNextLevel,
    totalXp,
    integrity,
    tier: tierForState(level, integrity),
    domains,
    domainsRaw,
    lastActiveAt,
    daysAbsent,
  };
}
