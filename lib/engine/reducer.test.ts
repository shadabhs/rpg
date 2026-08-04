import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reduce } from "./reducer";
import { chronicleEntries, buildLedger } from "./chronicle";
import type { SystemEvent } from "./events";
import type { DomainKey } from "./domains";
import {
  WEEKLY_XP_CAP,
  XP_BY_DIFFICULTY,
  INTEGRITY_BASELINE,
  INTEGRITY_GAIN_ON_DECLINE,
  INTEGRITY_GAIN_ON_RETRACT,
  domainGainFromXp,
  xpCostForLevel,
  decayFraction,
  DECAY_GRACE_DAYS,
  DECAY_CAP,
  tierForState,
  TIER_V_INTEGRITY_REQUIRED,
} from "./rules";

const iso = (daysFromEpoch: number) =>
  new Date(Date.UTC(2026, 0, 1 + daysFromEpoch, 9, 0, 0)).toISOString();

function completed(
  id: string,
  day: number,
  domain: DomainKey,
  difficulty: "TRIVIAL" | "STANDARD" | "HARD" | "SEVERE" = "STANDARD",
): SystemEvent {
  return { type: "quest_completed", id, timestamp: iso(day), domain, difficulty };
}

describe("reduce — the progression engine", () => {
  it("grants exactly the fixed XP for a single quest, known in advance", () => {
    const state = reduce([completed("q1", 0, "vitality", "STANDARD")]);
    expect(state.totalXp).toBe(XP_BY_DIFFICULTY.STANDARD);
    expect(state.domainsRaw.vitality).toBe(domainGainFromXp(XP_BY_DIFFICULTY.STANDARD));
  });

  it("never lets one week's XP exceed the weekly cap", () => {
    // 40 STANDARD completions (1,600 nominal XP) on the same day/week.
    const events: SystemEvent[] = Array.from({ length: 40 }, (_, i) =>
      completed(`farm-${i}`, 0, "vitality", "STANDARD"),
    );
    const state = reduce(events);
    expect(state.totalXp).toBeLessThanOrEqual(WEEKLY_XP_CAP);
    expect(state.totalXp).toBe(WEEKLY_XP_CAP);
  });

  it("resumes counting XP normally in the following week", () => {
    const weekOne = Array.from({ length: 40 }, (_, i) =>
      completed(`w1-${i}`, 0, "vitality", "STANDARD"),
    );
    const weekTwo = [completed("w2-1", 10, "vitality", "STANDARD")];
    const state = reduce([...weekOne, ...weekTwo]);
    expect(state.totalXp).toBe(WEEKLY_XP_CAP + XP_BY_DIFFICULTY.STANDARD);
  });

  it("crosses a level exactly at its XP threshold, not before or after", () => {
    const cost = xpCostForLevel(1);
    // TRIVIAL = 10 XP/step. One step short of the threshold must still be
    // level 1; the step that reaches the threshold must level up.
    const stepsToReach = Math.ceil(cost / XP_BY_DIFFICULTY.TRIVIAL);
    const belowEvents = Array.from({ length: stepsToReach - 1 }, (_, i) =>
      completed(`t${i}`, i, "mind", "TRIVIAL"),
    );
    const justBelow = reduce(belowEvents);
    expect(justBelow.totalXp).toBeLessThan(cost);
    expect(justBelow.level).toBe(1);

    const atThreshold = [
      ...belowEvents,
      completed("t-final", stepsToReach, "mind", "TRIVIAL"),
    ];
    const after = reduce(atThreshold);
    expect(after.totalXp).toBeGreaterThanOrEqual(cost);
    expect(after.level).toBe(2);
  });

  it("never lets quest completion touch Integrity", () => {
    const events = Array.from({ length: 12 }, (_, i) =>
      completed(`c${i}`, i, "craft", "HARD"),
    );
    const state = reduce(events);
    expect(state.integrity).toBe(INTEGRITY_BASELINE);
  });

  it("never lets a verified claim touch Integrity", () => {
    const state = reduce([
      {
        type: "claim_verified",
        id: "m1",
        timestamp: iso(0),
        domain: "craft",
        difficulty: "SEVERE",
        evidence: "shipped v1",
      },
    ]);
    expect(state.integrity).toBe(INTEGRITY_BASELINE);
    expect(state.totalXp).toBe(XP_BY_DIFFICULTY.SEVERE);
  });

  it("grants Integrity on NOT YET and touches nothing else", () => {
    const before = reduce([completed("q1", 0, "vitality", "STANDARD")]);
    const state = reduce([
      completed("q1", 0, "vitality", "STANDARD"),
      { type: "claim_declined", id: "d1", timestamp: iso(1) },
    ]);
    expect(state.integrity).toBe(INTEGRITY_BASELINE + INTEGRITY_GAIN_ON_DECLINE);
    expect(state.totalXp).toBe(before.totalXp);
    expect(state.domainsRaw).toEqual(before.domainsRaw);
    expect(state.level).toBe(before.level);
  });

  it("grants Integrity on retraction and refunds none of the original XP", () => {
    const claimed: SystemEvent = {
      type: "claim_verified",
      id: "m1",
      timestamp: iso(0),
      domain: "craft",
      difficulty: "SEVERE",
      evidence: "shipped v1",
    };
    const withoutRetraction = reduce([claimed]);
    const withRetraction = reduce([
      claimed,
      {
        type: "claim_retracted",
        id: "r1",
        timestamp: iso(5),
        retractsEventId: "m1",
      },
    ]);
    expect(withRetraction.totalXp).toBe(withoutRetraction.totalXp);
    expect(withRetraction.integrity).toBe(
      INTEGRITY_BASELINE + INTEGRITY_GAIN_ON_RETRACT,
    );
  });

  it("Integrity is monotonic — never decreases across any growing event sequence", () => {
    const events: SystemEvent[] = [];
    let day = 0;
    for (let i = 0; i < 30; i++) {
      const roll = i % 5;
      if (roll === 0) {
        events.push({ type: "claim_declined", id: `d${i}`, timestamp: iso(day) });
      } else if (roll === 1) {
        events.push({
          type: "claim_verified",
          id: `m${i}`,
          timestamp: iso(day),
          domain: "spirit",
          difficulty: "HARD",
          evidence: "note",
        });
      } else if (roll === 2) {
        events.push({
          type: "claim_retracted",
          id: `r${i}`,
          timestamp: iso(day),
          retractsEventId: `m${i - 1}`,
        });
      } else {
        events.push(completed(`q${i}`, day, "bonds", "STANDARD"));
      }
      day += 1;
    }

    let lastIntegrity = -Infinity;
    for (let i = 1; i <= events.length; i++) {
      const state = reduce(events.slice(0, i));
      expect(state.integrity).toBeGreaterThanOrEqual(lastIntegrity);
      lastIntegrity = state.integrity;
    }
  });

  it("applies no decay within the grace period", () => {
    const events = [completed("q1", 0, "vitality", "STANDARD")];
    const now = new Date(iso(DECAY_GRACE_DAYS));
    const state = reduce(events, now);
    expect(state.domains.vitality).toBe(state.domainsRaw.vitality);
  });

  it("caps decay at DECAY_CAP no matter how long the absence", () => {
    expect(decayFraction(9999)).toBe(DECAY_CAP);
    const events = [completed("q1", 0, "vitality", "SEVERE")];
    const now = new Date(iso(9999));
    const state = reduce(events, now);
    const expectedFloor = Math.round(state.domainsRaw.vitality * (1 - DECAY_CAP));
    expect(state.domains.vitality).toBe(expectedFloor);
  });

  it("never lets decay touch level, XP, or Integrity — no matter the absence", () => {
    const events = [completed("q1", 0, "vitality", "SEVERE")];
    const soon = reduce(events, new Date(iso(1)));
    const faraway = reduce(events, new Date(iso(9999)));
    expect(faraway.level).toBe(soon.level);
    expect(faraway.totalXp).toBe(soon.totalXp);
    expect(faraway.integrity).toBe(soon.integrity);
  });

  it("reaches Tier II by level alone, no Integrity required below Tier V", () => {
    // Cumulative cost to level 10 is a few thousand XP — cheap to reach in
    // a test by spending a handful of weeks at the weekly cap.
    const events: SystemEvent[] = [];
    for (let week = 0; week < 6; week++) {
      for (let i = 0; i < 38; i++) {
        events.push(completed(`t${week}-${i}`, week * 7, "craft", "STANDARD"));
      }
    }
    const state = reduce(events);
    expect(state.level).toBeGreaterThanOrEqual(10);
    expect(state.integrity).toBe(INTEGRITY_BASELINE);
    expect(state.tier).toBeGreaterThanOrEqual(2);
  });
});

describe("completion_retracted — the misclick undo", () => {
  it("voids the completion entirely — XP and domain gain return to exactly zero", () => {
    const state = reduce([
      completed("q1", 0, "vitality", "STANDARD"),
      {
        type: "completion_retracted",
        id: "u1",
        timestamp: iso(0),
        retractsEventId: "q1",
      },
    ]);
    expect(state.totalXp).toBe(0);
    expect(state.domainsRaw.vitality).toBe(0);
    expect(state.level).toBe(1);
  });

  it("is an exact inverse mid-history, not just at the end", () => {
    const others: SystemEvent[] = [
      completed("a", 0, "mind", "HARD"),
      completed("b", 1, "craft", "SEVERE"),
      completed("c", 2, "vitality", "TRIVIAL"),
    ];
    const without = reduce(others);
    const withUndone = reduce([
      others[0],
      completed("oops", 1, "bonds", "SEVERE"),
      ...others.slice(1),
      {
        type: "completion_retracted",
        id: "u1",
        timestamp: iso(3),
        retractsEventId: "oops",
      },
    ]);
    expect(withUndone.totalXp).toBe(without.totalXp);
    expect(withUndone.domainsRaw).toEqual(without.domainsRaw);
  });

  it("replays weekly-cap accounting — undoing a capped week frees headroom", () => {
    // Six SEVERE completions hit the cap exactly; a HARD after them counts
    // only against what's left. Undoing one SEVERE must free 250 of cap so
    // the HARD's full value replays — patching totals instead of voiding
    // the event during replay would get this wrong.
    const severes: SystemEvent[] = Array.from({ length: 6 }, (_, i) =>
      completed(`s${i}`, 0, "craft", "SEVERE"),
    );
    const hard = completed("h1", 1, "craft", "HARD");
    const capped = reduce([...severes, hard]);
    expect(capped.totalXp).toBe(WEEKLY_XP_CAP);

    const afterUndo = reduce([
      ...severes,
      hard,
      {
        type: "completion_retracted",
        id: "u1",
        timestamp: iso(2),
        retractsEventId: "s0",
      },
    ]);
    expect(afterUndo.totalXp).toBe(
      5 * XP_BY_DIFFICULTY.SEVERE + XP_BY_DIFFICULTY.HARD,
    );
  });

  it("grants nothing itself — no Integrity, no XP, no activity", () => {
    const state = reduce([
      completed("q1", 0, "vitality", "STANDARD"),
      {
        type: "completion_retracted",
        id: "u1",
        timestamp: iso(0),
        retractsEventId: "q1",
      },
    ]);
    expect(state.integrity).toBe(INTEGRITY_BASELINE);
    // The voided completion no longer counts as activity either — an
    // undone tap never happened, so it can't anchor the decay clock.
    expect(state.lastActiveAt).toBeNull();
  });

  it("cannot void a claim_verified — verified claims exit only via the audit", () => {
    const claim: SystemEvent = {
      type: "claim_verified",
      id: "m1",
      timestamp: iso(0),
      domain: "craft",
      difficulty: "SEVERE",
      evidence: "shipped v1",
    };
    const state = reduce([
      claim,
      {
        type: "completion_retracted",
        id: "u1",
        timestamp: iso(1),
        retractsEventId: "m1",
      },
    ]);
    expect(state.totalXp).toBe(XP_BY_DIFFICULTY.SEVERE);
  });
});

describe("streaks — what makes tomorrow exist", () => {
  const daily = (id: string, day: number): SystemEvent => ({
    type: "quest_completed",
    id,
    timestamp: iso(day),
    domain: "vitality",
    difficulty: "STANDARD",
    questId: "train",
  });

  it("counts consecutive days and reports doneToday", () => {
    const events = [daily("a", 0), daily("b", 1), daily("c", 2)];
    const state = reduce(events, new Date(iso(2)));
    expect(state.questStats.train.streak).toBe(3);
    expect(state.questStats.train.doneToday).toBe(true);
    expect(state.questStats.train.totalCompletions).toBe(3);
  });

  it("survives one un-done day — a streak breaks only after a full miss", () => {
    // Done through yesterday, nothing yet today: still alive, still 3.
    const events = [daily("a", 0), daily("b", 1), daily("c", 2)];
    const state = reduce(events, new Date(iso(3)));
    expect(state.questStats.train.doneToday).toBe(false);
    expect(state.questStats.train.streak).toBe(3);
  });

  it("breaks after a fully missed day but banks the best — history is never erased", () => {
    const events = [daily("a", 0), daily("b", 1), daily("c", 2)];
    const state = reduce(events, new Date(iso(5)));
    expect(state.questStats.train.streak).toBe(0);
    expect(state.questStats.train.bestStreak).toBe(3);
  });

  it("finds the best run even when it isn't the most recent one", () => {
    const events = [
      daily("a", 0),
      daily("b", 1),
      daily("c", 2),
      daily("d", 3), // 4-day run
      daily("e", 10),
      daily("f", 11), // later 2-day run
    ];
    const state = reduce(events, new Date(iso(11)));
    expect(state.questStats.train.streak).toBe(2);
    expect(state.questStats.train.bestStreak).toBe(4);
  });

  it("counts a day only once, however many times it was tapped", () => {
    const events = [daily("a", 0), daily("a2", 0), daily("b", 1)];
    const state = reduce(events, new Date(iso(1)));
    expect(state.questStats.train.streak).toBe(2);
  });

  it("drops a day from the streak when its only completion is undone", () => {
    const events: SystemEvent[] = [
      daily("a", 0),
      daily("b", 1),
      daily("c", 2),
      {
        type: "completion_retracted",
        id: "u1",
        timestamp: iso(2),
        retractsEventId: "b",
      },
    ];
    const state = reduce(events, new Date(iso(2)));
    expect(state.questStats.train.streak).toBe(1);
    expect(state.questStats.train.bestStreak).toBe(1);
    expect(state.questStats.train.totalCompletions).toBe(2);
  });

  it("uses the player's local day, not UTC — a late-night completion counts today", () => {
    // 23:00 UTC on day 0 is 04:30 on day 1 in IST (+330).
    const lateUtc: SystemEvent = {
      type: "quest_completed",
      id: "late",
      timestamp: new Date(Date.UTC(2026, 0, 1, 23, 0, 0)).toISOString(),
      domain: "mind",
      difficulty: "STANDARD",
      questId: "read",
    };
    const nowIst = new Date(Date.UTC(2026, 0, 2, 5, 0, 0));
    expect(reduce([lateUtc], nowIst, 330).questStats.read.doneToday).toBe(true);
    // Same instants read in UTC put the completion on the previous day.
    expect(reduce([lateUtc], nowIst, 0).questStats.read.doneToday).toBe(false);
  });

  it("keeps per-quest streaks independent", () => {
    const state = reduce(
      [
        daily("a", 0),
        daily("b", 1),
        {
          type: "quest_completed",
          id: "r1",
          timestamp: iso(1),
          domain: "mind",
          difficulty: "TRIVIAL",
          questId: "read",
        },
      ],
      new Date(iso(1)),
    );
    expect(state.questStats.train.streak).toBe(2);
    expect(state.questStats.read.streak).toBe(1);
  });
});

describe("tierForState — the Tier V honesty gate, tested directly", () => {
  it("caps at Tier IV when level qualifies for V but Integrity does not", () => {
    expect(tierForState(50, INTEGRITY_BASELINE)).toBe(4);
  });

  it("reaches Tier V only once both level and Integrity clear the bar", () => {
    expect(tierForState(50, TIER_V_INTEGRITY_REQUIRED)).toBe(5);
  });

  it("does not grant Tier V on Integrity alone without the level", () => {
    expect(tierForState(49, TIER_V_INTEGRITY_REQUIRED)).toBe(4);
  });
});

describe("chronicle & ledger — the System's memory, derived not stored", () => {
  const titles = { train: "Train — lower body" };

  it("renders completions as [DONE] lines and drops undone ones entirely", () => {
    const events: SystemEvent[] = [
      {
        type: "quest_completed",
        id: "a",
        timestamp: iso(0),
        domain: "vitality",
        difficulty: "STANDARD",
        questId: "train",
      },
      {
        type: "quest_completed",
        id: "oops",
        timestamp: iso(1),
        domain: "vitality",
        difficulty: "STANDARD",
        questId: "train",
      },
      {
        type: "completion_retracted",
        id: "u1",
        timestamp: iso(1),
        retractsEventId: "oops",
      },
    ];
    const entries = chronicleEntries(events, titles, 0);
    expect(entries).toHaveLength(1);
    expect(entries[0].tag).toBe("[DONE]");
    expect(entries[0].text).toBe("Train — lower body");
  });

  it("orders newest first and words honesty events in the System's voice", () => {
    const events: SystemEvent[] = [
      { type: "claim_declined", id: "d1", timestamp: iso(0) },
      {
        type: "claim_verified",
        id: "m1",
        timestamp: iso(1),
        domain: "craft",
        difficulty: "SEVERE",
        evidence: "shipped v1",
      },
      {
        type: "claim_retracted",
        id: "r1",
        timestamp: iso(2),
        retractsEventId: "m1",
      },
    ];
    const entries = chronicleEntries(events, {}, 0);
    expect(entries.map((e) => e.tag)).toEqual([
      "[RETRACTED]",
      "[CLAIMED]",
      "[HELD BACK]",
    ]);
    expect(entries[1].text).toContain("shipped v1");
    expect(entries[0].text).toContain("Nothing refunded");
  });

  it("counts the ledger from witnessed events only", () => {
    const events: SystemEvent[] = [
      {
        type: "quest_completed",
        id: "a",
        timestamp: iso(0),
        domain: "vitality",
        difficulty: "STANDARD",
        questId: "train",
      },
      {
        type: "quest_completed",
        id: "b",
        timestamp: iso(0),
        domain: "mind",
        difficulty: "TRIVIAL",
        questId: "read",
      },
      {
        type: "quest_completed",
        id: "c",
        timestamp: iso(1),
        domain: "vitality",
        difficulty: "STANDARD",
        questId: "train",
      },
      {
        type: "completion_retracted",
        id: "u1",
        timestamp: iso(1),
        retractsEventId: "c",
      },
      {
        type: "claim_verified",
        id: "m1",
        timestamp: iso(2),
        domain: "craft",
        difficulty: "SEVERE",
        evidence: "",
      },
      { type: "claim_declined", id: "d1", timestamp: iso(3) },
    ];
    const ledger = buildLedger(events, 0);
    // Day 1's only completion was undone, so it is not an active day.
    expect(ledger.daysActive).toBe(2);
    expect(ledger.questsCompleted).toBe(2);
    expect(ledger.milestonesClaimed).toBe(1);
    expect(ledger.timesHeldBack).toBe(1);
  });
});

describe("the AI boundary is structurally enforced, not just documented", () => {
  const forbidden = [
    "fetch(",
    "XMLHttpRequest",
    "axios",
    "anthropic",
    "openai",
    "@anthropic-ai",
    'from "http',
    "require(\"http",
    "Math.random",
  ];

  // chronicle.ts is held to the same standard: the System's voice is
  // deterministic — an AI may later rephrase what it derives, but the
  // derivation itself must never reach for a network or an LLM.
  for (const file of ["reducer.ts", "rules.ts", "chronicle.ts"]) {
    it(`${file} contains no network I/O, randomness, or AI-client imports`, () => {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      for (const needle of forbidden) {
        expect(source.toLowerCase().includes(needle.toLowerCase())).toBe(false);
      }
    });
  }
});
