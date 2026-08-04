import type { DomainKey } from "./domains";
import type { Difficulty } from "./rules";

/**
 * The append-only event log. Never store `xp = 4500`; store what happened
 * and derive everything else by replaying it (see reducer.ts). This is one
 * of the two decisions DESIGN.md calls out as genuinely hard to change
 * later, so it's implemented properly from Phase 1's first line of code
 * rather than retrofitted.
 */
export type SystemEvent =
  | {
      type: "quest_completed";
      id: string;
      timestamp: string; // ISO 8601
      domain: DomainKey;
      difficulty: Difficulty;
      /** Which quest this completion belongs to. Optional because events
       *  written before the quest_id column existed don't carry it. */
      questId?: string;
      /** Loot RESULT, rolled server-side at completion time (lib/loot.ts)
       *  and stored here. Replay just sums it — chance never re-enters.
       *  Absent on optimistic client events until the server answers. */
      gold?: number;
      item?: string;
    }
  | {
      /** A milestone/epic claim confirmed via the Verification Screen. */
      type: "claim_verified";
      id: string;
      timestamp: string;
      domain: DomainKey;
      difficulty: Difficulty;
      evidence: string;
      questId?: string;
      /** Claimed while its requisites were unmet — the honest override.
       *  Grants full XP and costs no Integrity (doing a thing you weren't
       *  "ready" for is not dishonesty); it exists so the record stays
       *  accurate about what preparation was on file at the time. */
      unprepared?: boolean;
    }
  | {
      /** The player chose NOT YET. Grants Integrity, nothing else — and
       *  only the FIRST time for a given quest: declining the same
       *  milestone twice is not a second act of honesty. */
      type: "claim_declined";
      id: string;
      timestamp: string;
      questId?: string;
    }
  | {
      /** A prior claim_verified retracted during a seasonal self-audit.
       *  Grants Integrity and refunds nothing. */
      type: "claim_retracted";
      id: string;
      timestamp: string;
      retractsEventId: string;
    }
  | {
      /** The misclick undo: reverses a prior quest_completed. The reducer
       *  voids the referenced event entirely — XP, domain gain and
       *  weekly-cap usage all replay as if the tap never happened. Grants
       *  nothing, costs nothing beyond the refund; there is no Integrity
       *  angle because a misclick is not a claim. Deliberately distinct
       *  from claim_retracted, the honesty admission that refunds nothing.
       *  Only quest_completed events are voidable — verified claims exit
       *  through the seasonal audit, never through undo. */
      type: "completion_retracted";
      id: string;
      timestamp: string;
      retractsEventId: string;
    };

export type SystemEventType = SystemEvent["type"];
