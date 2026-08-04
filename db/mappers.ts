import type { SystemEvent } from "@/lib/engine/events";
import type { DomainKey } from "@/lib/engine/domains";
import type { Difficulty } from "@/lib/engine/rules";

/** Raw shape of a `quests` row as returned by the Supabase client. */
export type QuestRow = {
  id: string;
  title: string;
  domain: DomainKey;
  difficulty: Difficulty;
  when_text: string;
  where_text: string;
  weighty: boolean;
  grants: string | null;
  status: "active" | "completed" | "archived";
};

/**
 * Bridges the raw row shape the Supabase JS client actually returns to the
 * camelCase SystemEvent union the engine expects.
 *
 * Important: this is genuinely snake_case, matching db/schema.ts's SQL
 * column names verbatim — supabase-js does not camelCase results the way
 * Drizzle's query builder would. Drizzle here is schema/migration tooling
 * only; nothing at runtime queries through it.
 *
 * Kept as one small, explicit function rather than a generic mapper — the
 * event union is a closed set of four shapes, and a switch makes an
 * unrecognized `type` from the database (corrupt data, a future migration
 * gap) fail loudly instead of silently.
 */
export type EventRow = {
  id: string;
  type: string;
  domain: string | null;
  difficulty: string | null;
  evidence: string | null;
  retracts_event_id: string | null;
  quest_id: string | null;
  occurred_at: string;
};

export function rowToEvent(row: EventRow): SystemEvent {
  switch (row.type) {
    case "quest_completed":
      return {
        type: "quest_completed",
        id: row.id,
        timestamp: row.occurred_at,
        domain: row.domain as DomainKey,
        difficulty: row.difficulty as Difficulty,
        questId: row.quest_id ?? undefined,
      };
    case "claim_verified":
      return {
        type: "claim_verified",
        id: row.id,
        timestamp: row.occurred_at,
        domain: row.domain as DomainKey,
        difficulty: row.difficulty as Difficulty,
        evidence: row.evidence ?? "",
      };
    case "claim_declined":
      return { type: "claim_declined", id: row.id, timestamp: row.occurred_at };
    case "claim_retracted":
      return {
        type: "claim_retracted",
        id: row.id,
        timestamp: row.occurred_at,
        retractsEventId: row.retracts_event_id ?? "",
      };
    case "completion_retracted":
      return {
        type: "completion_retracted",
        id: row.id,
        timestamp: row.occurred_at,
        retractsEventId: row.retracts_event_id ?? "",
      };
    default:
      throw new Error(`Unknown event type from database: "${row.type}"`);
  }
}
