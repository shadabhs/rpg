"use client";

import { useState } from "react";
import { ActionsProvider, type ActionSet } from "@/components/ActionsContext";
import { StatusWindowClient } from "@/components/StatusWindowClient";
import type { SystemEvent } from "@/lib/engine/events";
import type { QuestRow, EpicRow } from "@/db/mappers";
import { GOLD_BY_DIFFICULTY, type Difficulty } from "@/lib/engine/rules";

/**
 * A harness-local stand-in for the server's loot roll. lib/loot.ts states
 * "never call it from the client", and that holds even here — importing it
 * would pull the real roll into a client bundle and set the wrong
 * precedent for the one module where randomness lives.
 */
function stubLoot(difficulty: Difficulty): { gold: number; item: string | null } {
  const { min, max } = GOLD_BY_DIFFICULTY[difficulty];
  return { gold: Math.round((min + max) / 2), item: null };
}

/**
 * A driveable copy of the real Status Window backed by in-memory state
 * instead of Supabase. The COMPONENTS are the shipping ones — only the
 * write surface is stubbed — so a Playwright pass here exercises the
 * actual rendering, streak maths, optimistic updates, revert paths and
 * overlay choreography that reach users.
 *
 * What it does NOT cover: the Server Actions themselves (auth, RLS,
 * cap enforcement, the daily double-completion guard). Those are
 * server-side and still need a real deployment to verify.
 *
 * Reachable only when PREVIEW_MODE=1 is set on the server; see
 * app/preview/page.tsx and proxy.ts.
 */

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

export type Scenario = "fresh" | "seasoned" | "reloaded";

/** PostgREST emits timestamptz as `2026-08-04T07:30:00.123456+00:00`, not
 *  the `...Z` shape client-generated events use. The reloaded scenario
 *  reproduces that exactly, because "works with Z strings" proved nothing
 *  about the state a real hard reload hydrates from the database. */
const pgTimestamp = (msAgo: number) => {
  const d = new Date(Date.now() - msAgo);
  return d.toISOString().replace("Z", "456+00:00");
};

function seed(scenario: Scenario): {
  quests: QuestRow[];
  epics: EpicRow[];
  events: SystemEvent[];
  characterName: string;
  title: string;
} {
  if (scenario === "fresh") {
    // Brand new: triggers the first-run rite.
    return { quests: [], epics: [], events: [], characterName: "SUBJECT", title: "The Unproven" };
  }

  if (scenario === "reloaded") {
    // The exact state the live QA pass was in when UNDO failed: a daily
    // quest completed TODAY, then a hard reload — so the only event is a
    // DATABASE-shaped row (uuid id, PostgREST timestamp format), not a
    // client-optimistic one.
    return {
      characterName: "SHADAB",
      title: "The Unproven",
      epics: [],
      quests: [
        {
          id: "e1a7c9d2-4b3f-4a6e-9c1d-2f8b5a7e3c4d",
          epic_id: null,
          title: "Train — lower body",
          domain: "vitality",
          difficulty: "STANDARD",
          when_text: "06:40",
          where_text: "Gym",
          weighty: false,
          cadence: "daily",
          requisites: null,
          grants: null,
          status: "active",
        },
      ],
      events: [
        {
          type: "quest_completed",
          id: "7f2b8c1a-9d4e-4f3a-b6c5-1e8d7a2f9b3c",
          timestamp: pgTimestamp(35 * 60_000), // completed 35 min ago
          domain: "vitality",
          difficulty: "STANDARD",
          questId: "e1a7c9d2-4b3f-4a6e-9c1d-2f8b5a7e3c4d",
          gold: 5,
        },
      ],
    };
  }

  const epics: EpicRow[] = [
    {
      id: "epic-1",
      title: "Reclaim the body",
      intent: "I want to climb three flights without stopping.",
      domain: "vitality",
      status: "active",
    },
  ];

  const quests: QuestRow[] = [
    {
      id: "q-daily",
      epic_id: "epic-1",
      title: "Train — lower body",
      domain: "vitality",
      difficulty: "STANDARD",
      when_text: "06:40",
      where_text: "Gym",
      weighty: false,
      cadence: "daily",
      requisites: null,
      grants: null,
      status: "active",
    },
    {
      id: "q-once",
      epic_id: null,
      title: "Call home",
      domain: "bonds",
      difficulty: "TRIVIAL",
      when_text: "Sunday 19:00",
      where_text: "From the balcony",
      weighty: false,
      cadence: "once",
      requisites: null,
      grants: null,
      status: "active",
    },
    {
      id: "q-milestone",
      epic_id: "epic-1",
      title: "Climb three flights without stopping",
      domain: "vitality",
      difficulty: "SEVERE",
      weighty: true,
      cadence: "once",
      when_text: "When ready",
      where_text: "The stairwell",
      // Deliberately unmet: 40 Conditioning against ~8 earned, and a
      // 21-day run against a best of 4. Exercises the [LOCKED] state and
      // the honest override.
      requisites: [
        { kind: "material", domain: "vitality", amount: 40 },
        { kind: "streak", questId: "q-daily", days: 21, label: "Train — lower body" },
      ],
      grants: "[Breath of the Ascent]",
      status: "active",
    },
  ];

  // A 4-day run on the daily, ending YESTERDAY — so tapping it today
  // takes the streak to 5 and should fire a [RECORD] (best is 4).
  const events: SystemEvent[] = [4, 3, 2, 1].map((d, i) => ({
    type: "quest_completed" as const,
    id: `hist-${i}`,
    timestamp: ago(d),
    domain: "vitality" as const,
    difficulty: "STANDARD" as const,
    questId: "q-daily",
    gold: 4,
  }));

  return {
    quests,
    epics,
    events,
    characterName: "SHADAB",
    title: "The Unproven",
  };
}

export function PreviewHarness({ scenario }: { scenario: Scenario }) {
  const initial = seed(scenario);
  // Mirrors the DB rows the real actions would have written, so the
  // harness can answer like the server does.
  const [rows] = useState(() => ({ quests: [...initial.quests] }));

  const ok = { ok: true as const };

  const actions: ActionSet = {
    completeQuest: async (questId: string) => {
      const q = rows.quests.find((x) => x.id === questId);
      if (!q) return { ok: false, error: "Quest not found." };
      if (q.weighty) {
        return { ok: false, error: "Milestones require verification, not a tap." };
      }
      const loot = stubLoot(q.difficulty);
      return { ...ok, gold: loot.gold, item: loot.item };
    },
    undoCompletion: async () => ok,
    verifyClaim: async () => ok,
    declineClaim: async () => ok,
    createQuest: async () => ({ ...ok, id: `q-${Math.random().toString(36).slice(2, 8)}` }),
    createEpic: async () => ({ ...ok, id: `epic-${Math.random().toString(36).slice(2, 8)}` }),
    chooseTitle: async () => ok,
    setCharacterName: async () => ok,
    // No server to resync from — harness truth lives in the client.
    resync: () => {},
    // A deliberate failure path, driven by a magic title, so the harness
    // can prove the revert + [ REJECTED ] fault line actually work.
  } as ActionSet;

  const withRejection: ActionSet = {
    ...actions,
    chooseTitle: async (name: string) =>
      name === "The Honest Hand"
        ? { ok: false as const, error: "That title has not been earned." }
        : ok,
  };

  return (
    <ActionsProvider actions={withRejection}>
      <StatusWindowClient
        characterName={initial.characterName}
        title={initial.title}
        initialEvents={initial.events}
        initialQuests={initial.quests}
        initialEpics={initial.epics}
      />
    </ActionsProvider>
  );
}
