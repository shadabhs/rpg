import type { SystemEvent } from "./events";
import type { CharacterState } from "./reducer";

/**
 * Titles — earned nouns. Cosmetic forever: a title changes nothing
 * mechanically, per the covenant. Each has a deterministic condition
 * over derived state and the event log; nothing here is granted by an
 * AI or a hand of god, and this file is held to the engine's static
 * purity check like reducer.ts.
 *
 * Discovery: `kind: "level"` titles show their requirement while locked
 * (goal gradient — you can see the next threshold approaching).
 * `kind: "hidden"` titles show only ??? until earned — the System
 * conceals them so that earning one is a discovery, not a checklist.
 */

export type TitleDef = {
  key: string;
  name: string;
  /** Shown once earned — the cold statement of what was witnessed. */
  earnedText: string;
  kind: "level" | "hidden";
  /** Only for kind "level": the requirement, shown while locked. */
  level?: number;
  earned: (state: CharacterState, events: SystemEvent[]) => boolean;
};

const anyStreakAtLeast = (state: CharacterState, days: number) =>
  Object.values(state.questStats).some((s) => s.bestStreak >= days);

/** True when a completion follows a gap of `gapDays`+ after prior
 *  activity — the anti-shame title: coming back is witnessed, not the
 *  absence. */
function returnedAfterAbsence(events: SystemEvent[], gapDays: number): boolean {
  const active = events
    .filter((e) => e.type === "quest_completed" || e.type === "claim_verified")
    .map((e) => new Date(e.timestamp).getTime())
    .sort((a, b) => a - b);
  for (let i = 1; i < active.length; i++) {
    if (active[i] - active[i - 1] >= gapDays * 86_400_000) return true;
  }
  return false;
}

export const TITLE_DEFS: TitleDef[] = [
  {
    key: "awakened",
    name: "Awakened",
    earnedText: "Reached Level 2. The first level is the hardest to leave.",
    kind: "level",
    level: 2,
    earned: (s) => s.level >= 2,
  },
  {
    key: "persistent",
    name: "The Persistent",
    earnedText: "Reached Level 5.",
    kind: "level",
    level: 5,
    earned: (s) => s.level >= 5,
  },
  {
    key: "committed",
    name: "The Committed",
    earnedText: "Reached Level 10.",
    kind: "level",
    level: 10,
    earned: (s) => s.level >= 10,
  },
  {
    key: "honest-hand",
    name: "The Honest Hand",
    earnedText: "Chose NOT YET when claiming was easier.",
    kind: "hidden",
    earned: (_, events) => events.some((e) => e.type === "claim_declined"),
  },
  {
    key: "ironbound",
    name: "Ironbound",
    earnedText: "Completed something SEVERE.",
    kind: "hidden",
    earned: (_, events) =>
      events.some(
        (e) =>
          (e.type === "quest_completed" || e.type === "claim_verified") &&
          e.difficulty === "SEVERE",
      ),
  },
  {
    key: "unbroken-vii",
    name: "Unbroken VII",
    earnedText: "Seven consecutive days on one discipline.",
    kind: "hidden",
    earned: (s) => anyStreakAtLeast(s, 7),
  },
  {
    key: "unbroken-xxx",
    name: "Unbroken XXX",
    earnedText: "Thirty consecutive days on one discipline.",
    kind: "hidden",
    earned: (s) => anyStreakAtLeast(s, 30),
  },
  {
    key: "chapter-one",
    name: "Chapter One",
    earnedText: "Claimed a milestone and stood behind it.",
    kind: "hidden",
    earned: (_, events) => events.some((e) => e.type === "claim_verified"),
  },
  {
    key: "returned",
    name: "The Returned",
    earnedText: "Came back after seven days of silence. That is the hard part.",
    kind: "hidden",
    earned: (_, events) => returnedAfterAbsence(events, 7),
  },
  {
    key: "centurion",
    name: "Centurion",
    earnedText: "One hundred quests completed.",
    kind: "hidden",
    earned: (s) =>
      Object.values(s.questStats).reduce((n, q) => n + q.totalCompletions, 0) >=
      100,
  },
];

/** The default title everyone starts with. Not earned — assigned. */
export const DEFAULT_TITLE = "The Unproven";

export function earnedTitles(
  state: CharacterState,
  events: SystemEvent[],
): TitleDef[] {
  return TITLE_DEFS.filter((t) => t.earned(state, events));
}

/** Every title the player may legitimately wear right now. */
export function selectableTitles(
  state: CharacterState,
  events: SystemEvent[],
): string[] {
  return [DEFAULT_TITLE, ...earnedTitles(state, events).map((t) => t.name)];
}
