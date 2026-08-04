import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * One row per user. Cosmetic/identity fields only — level, XP, domains and
 * Integrity are never stored here. They're derived by replaying
 * `event_log` through lib/engine/reducer.ts. Storing a computed total
 * alongside the log that produced it is exactly the anti-pattern
 * DESIGN.md's architecture section warns against.
 */
export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey(), // = auth.users.id
  characterName: text("character_name").notNull().default("SUBJECT"),
  title: text("title").notNull().default("The Unproven"),
  avatarCharacter: text("avatar_character").notNull().default("default"),
  inductionCompletedAt: timestamp("induction_completed_at", {
    withTimezone: true,
  }),
  seasonStartedAt: timestamp("season_started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * User-authored quest definitions. This table IS allowed to be a normal
 * mutable row (edit a title, archive a quest) — it's a convenience index of
 * "what's outstanding," not the progression ledger. The one field that
 * matters for the covenant, `difficulty`, is fixed at creation and never
 * edited by application code after that (declared before completion, never
 * inflated after — see AGENTS.md).
 */
export const quests = pgTable(
  "quests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    title: text("title").notNull(),
    domain: text("domain").notNull(), // DomainKey
    difficulty: text("difficulty").notNull(), // Difficulty
    whenText: text("when_text").notNull(),
    whereText: text("where_text").notNull(),
    weighty: boolean("weighty").notNull().default(false),
    grants: text("grants"),
    /** 'once' quests flip to completed and leave the list; 'daily' quests
     *  stay active forever — "done today" is derived from quest_completed
     *  events, which is what makes streaks computable from the log alone. */
    cadence: text("cadence").notNull().default("once"), // once | daily
    status: text("status").notNull().default("active"), // active | completed | archived
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("quests_user_id_idx").on(t.userId)],
);

/**
 * The append-only event log — the actual source of truth for progression.
 * Never store `xp = 4500`; store what happened and derive everything else
 * by replaying it through lib/engine/reducer.ts.
 *
 * RLS (see db/policies.sql) grants users INSERT and SELECT on their own
 * rows and deliberately NO update/delete policy — even the row owner
 * cannot rewrite history through the API. That's what makes the honesty
 * system's audit trail provable rather than decorative.
 */
export const eventLog = pgTable(
  "event_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    type: text("type").notNull(), // SystemEventType
    domain: text("domain"), // quest_completed / claim_verified only
    difficulty: text("difficulty"), // quest_completed / claim_verified only
    evidence: text("evidence"), // claim_verified only
    retractsEventId: uuid("retracts_event_id"), // claim_retracted / completion_retracted
    questId: uuid("quest_id"), // quest_completed / claim_verified / completion_retracted
    /** Loot RESULT, stored at insert time. The roll happens server-side in
     *  the action (never in the reducer — the engine's static purity check
     *  forbids randomness there); replay just sums what was rolled. */
    gold: integer("gold"), // quest_completed only
    item: text("item"), // quest_completed only, flavour drop
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("event_log_user_id_idx").on(t.userId),
    index("event_log_occurred_at_idx").on(t.occurredAt),
  ],
);
