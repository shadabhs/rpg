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
    }
  | {
      /** A milestone/epic claim confirmed via the Verification Screen. */
      type: "claim_verified";
      id: string;
      timestamp: string;
      domain: DomainKey;
      difficulty: Difficulty;
      evidence: string;
    }
  | {
      /** The player chose NOT YET. Grants Integrity, nothing else. */
      type: "claim_declined";
      id: string;
      timestamp: string;
    }
  | {
      /** A prior claim_verified retracted during a seasonal self-audit.
       *  Grants Integrity and refunds nothing. */
      type: "claim_retracted";
      id: string;
      timestamp: string;
      retractsEventId: string;
    };

export type SystemEventType = SystemEvent["type"];
