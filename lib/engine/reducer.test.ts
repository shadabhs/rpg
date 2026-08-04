import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reduce } from "./reducer";
import {
  chronicleEntries,
  buildLedger,
  buildDayReport,
  buildWeekReport,
} from "./chronicle";
import { TITLE_DEFS, selectableTitles, DEFAULT_TITLE } from "./titles";
import { evaluateRequisites } from "./requisites";
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

  // DESIGN CHANGE (deliberate): a retraction now voids a claim_verified
  // too. Previously a mis-tapped milestone was permanent, because the
  // seasonal audit that was supposed to be its exit does not exist yet —
  // a trap, not a principle. The MISCLICK WINDOW lives in the action
  // layer (same local day only); the engine simply honours the
  // retraction. This is covenant-safe because voiding only ever REMOVES.
  it("voids a claim_verified when retracted, refunding exactly what it granted", () => {
    const claim: SystemEvent = {
      type: "claim_verified",
      id: "m1",
      timestamp: iso(0),
      domain: "craft",
      difficulty: "SEVERE",
      evidence: "shipped v1",
    };
    const withClaim = reduce([claim]);
    expect(withClaim.totalXp).toBe(XP_BY_DIFFICULTY.SEVERE);

    const voided = reduce([
      claim,
      {
        type: "completion_retracted",
        id: "u1",
        timestamp: iso(0),
        retractsEventId: "m1",
      },
    ]);
    expect(voided.totalXp).toBe(0);
    expect(voided.domainsRaw.craft).toBe(0);
    expect(voided.integrity).toBe(INTEGRITY_BASELINE);
  });

  it("a retraction can never be a net gain, for either event type", () => {
    // The property that makes the misclick window covenant-safe.
    const events: SystemEvent[] = [
      completed("q1", 0, "vitality", "HARD"),
      {
        type: "claim_verified",
        id: "m1",
        timestamp: iso(0),
        domain: "craft",
        difficulty: "SEVERE",
        evidence: "x",
      },
    ];
    const full = reduce(events);
    for (const targetId of ["q1", "m1"]) {
      const after = reduce([
        ...events,
        {
          type: "completion_retracted",
          id: `u-${targetId}`,
          timestamp: iso(0),
          retractsEventId: targetId,
        },
      ]);
      expect(after.totalXp).toBeLessThan(full.totalXp);
      expect(after.integrity).toBe(full.integrity);
    }
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

describe("gold — replayed from stored rolls, voided with the completion", () => {
  it("sums stored gold and never re-rolls", () => {
    const events: SystemEvent[] = [
      {
        type: "quest_completed",
        id: "a",
        timestamp: iso(0),
        domain: "vitality",
        difficulty: "STANDARD",
        questId: "train",
        gold: 5,
      },
      {
        type: "quest_completed",
        id: "b",
        timestamp: iso(1),
        domain: "vitality",
        difficulty: "HARD",
        questId: "train",
        gold: 14,
        item: "Oath-Marked Coin",
      },
    ];
    expect(reduce(events).gold).toBe(19);
    // Determinism: same events, same gold, every replay.
    expect(reduce(events).gold).toBe(reduce(events).gold);
  });

  it("undo takes the loot with it", () => {
    const events: SystemEvent[] = [
      {
        type: "quest_completed",
        id: "a",
        timestamp: iso(0),
        domain: "vitality",
        difficulty: "STANDARD",
        questId: "train",
        gold: 7,
      },
      {
        type: "completion_retracted",
        id: "u1",
        timestamp: iso(0),
        retractsEventId: "a",
      },
    ];
    expect(reduce(events).gold).toBe(0);
  });
});

describe("titles — earned nouns, deterministic conditions", () => {
  const byKey = Object.fromEntries(TITLE_DEFS.map((t) => [t.key, t]));

  it("The Honest Hand requires a NOT YET on record", () => {
    const none = reduce([]);
    expect(byKey["honest-hand"].earned(none, [])).toBe(false);
    const declined: SystemEvent[] = [
      { type: "claim_declined", id: "d1", timestamp: iso(0) },
    ];
    expect(byKey["honest-hand"].earned(reduce(declined), declined)).toBe(true);
  });

  it("Unbroken VII requires a 7-day best streak on one quest", () => {
    const six: SystemEvent[] = Array.from({ length: 6 }, (_, i) => ({
      type: "quest_completed",
      id: `s${i}`,
      timestamp: iso(i),
      domain: "vitality",
      difficulty: "STANDARD",
      questId: "train",
    }));
    expect(byKey["unbroken-vii"].earned(reduce(six, new Date(iso(5))), six)).toBe(
      false,
    );
    const seven: SystemEvent[] = [
      ...six,
      {
        type: "quest_completed",
        id: "s7",
        timestamp: iso(6),
        domain: "vitality",
        difficulty: "STANDARD",
        questId: "train",
      },
    ];
    expect(
      byKey["unbroken-vii"].earned(reduce(seven, new Date(iso(6))), seven),
    ).toBe(true);
  });

  it("The Returned witnesses the comeback, not the absence", () => {
    const gap: SystemEvent[] = [
      completed("a", 0, "vitality", "STANDARD"),
      completed("b", 8, "vitality", "STANDARD"), // 8 days later
    ];
    expect(byKey["returned"].earned(reduce(gap), gap)).toBe(true);
    const noGap: SystemEvent[] = [
      completed("a", 0, "vitality", "STANDARD"),
      completed("b", 3, "vitality", "STANDARD"),
    ];
    expect(byKey["returned"].earned(reduce(noGap), noGap)).toBe(false);
  });

  it("selectableTitles always includes the assigned default", () => {
    expect(selectableTitles(reduce([]), [])).toContain(DEFAULT_TITLE);
  });

  it("level-gated titles unlock exactly at their level", () => {
    // Enough STANDARD completions to clear level 2 (costs 60 XP).
    const events: SystemEvent[] = [
      completed("a", 0, "craft", "STANDARD"),
      completed("b", 1, "craft", "STANDARD"),
    ];
    const state = reduce(events);
    expect(state.level).toBeGreaterThanOrEqual(2);
    expect(byKey["awakened"].earned(state, events)).toBe(true);
    expect(byKey["persistent"].earned(state, events)).toBe(state.level >= 5);
  });
});

describe("day & week reports — the close-out's numbers, cap-aware", () => {
  it("reports today's XP as the replay difference, so the weekly cap is honoured", () => {
    // Yesterday fills the cap exactly (6 × SEVERE = 1500); today's HARD
    // banks 0 real XP. Nominal arithmetic would claim 100.
    const yesterday: SystemEvent[] = Array.from({ length: 6 }, (_, i) =>
      completed(`y${i}`, 0, "craft", "SEVERE"),
    );
    const today = [completed("t1", 1, "craft", "HARD")];
    const report = buildDayReport([...yesterday, ...today], new Date(iso(1)), 0);
    expect(report.completionsToday).toBe(1);
    expect(report.xpToday).toBe(0);
  });

  it("does not count an undone completion in today's tally", () => {
    const events: SystemEvent[] = [
      completed("a", 0, "vitality", "STANDARD"),
      {
        type: "completion_retracted",
        id: "u1",
        timestamp: iso(0),
        retractsEventId: "a",
      },
    ];
    const report = buildDayReport(events, new Date(iso(0)), 0);
    expect(report.completionsToday).toBe(0);
    expect(report.xpToday).toBe(0);
  });

  it("holds this week against the best week on record", () => {
    // iso() days 0-2 (Jan 1-3 2026) land in one ISO week; day 10 in a later one.
    const bigWeek: SystemEvent[] = [
      completed("a", 0, "craft", "STANDARD"),
      completed("b", 1, "craft", "STANDARD"),
      completed("c", 2, "craft", "STANDARD"),
    ];
    const thisWeek = [completed("d", 10, "craft", "STANDARD")];
    const report = buildWeekReport([...bigWeek, ...thisWeek], new Date(iso(10)), 0);
    expect(report.thisWeek).toBe(1);
    expect(report.bestWeek).toBe(3);
    expect(report.isBestWeek).toBe(false);
  });

  it("calls a tied week a best week — equalling your best is not a failure", () => {
    const events = [completed("a", 0, "craft", "STANDARD")];
    const report = buildWeekReport(events, new Date(iso(0)), 0);
    expect(report.isBestWeek).toBe(true);
  });
});

describe("requisites — preparation as an honest gate", () => {
  const trainDays = (n: number): SystemEvent[] =>
    Array.from({ length: n }, (_, i) => ({
      type: "quest_completed",
      id: `t${i}`,
      timestamp: iso(i),
      domain: "vitality",
      difficulty: "STANDARD",
      questId: "train",
    }));

  it("is met when there are no requisites at all — nothing existing changes", () => {
    const report = evaluateRequisites(null, reduce([]), []);
    expect(report.met).toBe(true);
    expect(report.statuses).toHaveLength(0);
  });

  it("states the exact shortfall on a material threshold, never a bare 'locked'", () => {
    const events = trainDays(3); // 3 x STANDARD = 6 raw vitality
    const report = evaluateRequisites(
      [{ kind: "material", domain: "vitality", amount: 40 }],
      reduce(events, new Date(iso(2))),
      events,
    );
    expect(report.met).toBe(false);
    expect(report.statuses[0].have).toBe(6);
    expect(report.statuses[0].need).toBe(40);
    expect(report.statuses[0].text).toContain("Requires 40 Conditioning");
    expect(report.statuses[0].text).toContain("You have 6");
  });

  it("reads materials from the RAW domain value, so absence never un-earns preparation", () => {
    const events = trainDays(30);
    const fresh = reduce(events, new Date(iso(29)));
    const longAbsent = reduce(events, new Date(iso(900)));
    // Rust has visibly reduced the displayed stat...
    expect(longAbsent.domains.vitality).toBeLessThan(longAbsent.domainsRaw.vitality);
    // ...but the requisite reads the same either way: the reps were done.
    const req = [{ kind: "material" as const, domain: "vitality" as const, amount: 40 }];
    expect(evaluateRequisites(req, longAbsent, events).statuses[0].have).toBe(
      evaluateRequisites(req, fresh, events).statuses[0].have,
    );
  });

  it("satisfies a component-milestone requisite only once that claim is on the record", () => {
    const req = [
      { kind: "milestone" as const, questId: "m-incorporate", label: "Incorporated" },
    ];
    expect(evaluateRequisites(req, reduce([]), []).met).toBe(false);

    const claimed: SystemEvent[] = [
      {
        type: "claim_verified",
        id: "c1",
        timestamp: iso(0),
        domain: "craft",
        difficulty: "HARD",
        evidence: "cert",
        questId: "m-incorporate",
      },
    ];
    expect(evaluateRequisites(req, reduce(claimed), claimed).met).toBe(true);
  });

  it("judges a streak requisite on the best run ever, so it cannot be crammed but is never lost", () => {
    const events = trainDays(10);
    const req = [
      { kind: "streak" as const, questId: "train", days: 21, label: "Train" },
    ];
    const atTen = reduce(events, new Date(iso(9)));
    expect(evaluateRequisites(req, atTen, events).statuses[0].have).toBe(10);
    expect(evaluateRequisites(req, atTen, events).met).toBe(false);

    // Long after the streak lapsed, the capability it proved still counts.
    const lapsed = reduce(events, new Date(iso(400)));
    expect(lapsed.questStats.train.streak).toBe(0);
    expect(evaluateRequisites(req, lapsed, events).statuses[0].have).toBe(10);
  });

  it("requires every requisite, and counts exactly how many are unmet", () => {
    const events = trainDays(3);
    const state = reduce(events, new Date(iso(2)));
    const report = evaluateRequisites(
      [
        { kind: "material", domain: "vitality", amount: 40 },
        { kind: "streak", questId: "train", days: 21, label: "Train" },
        { kind: "material", domain: "vitality", amount: 1 }, // already met
      ],
      state,
      events,
    );
    expect(report.met).toBe(false);
    expect(report.unmetCount).toBe(2);
    expect(report.statuses.filter((s) => s.met)).toHaveLength(1);
  });

  it("COVENANT: a requisite is only ever a report — it can never withhold XP", () => {
    // The gate lives entirely in evaluateRequisites; reduce() has no
    // knowledge of it, so an unprepared claim pays exactly like any other.
    const unprepared: SystemEvent = {
      type: "claim_verified",
      id: "m1",
      timestamp: iso(0),
      domain: "vitality",
      difficulty: "SEVERE",
      evidence: "ran it anyway",
      questId: "m-half",
      unprepared: true,
    };
    const prepared: SystemEvent = { ...unprepared, id: "m2", unprepared: false };
    expect(reduce([unprepared]).totalXp).toBe(XP_BY_DIFFICULTY.SEVERE);
    expect(reduce([unprepared]).totalXp).toBe(reduce([prepared]).totalXp);
    // And it costs no Integrity: doing a thing early is not dishonesty.
    expect(reduce([unprepared]).integrity).toBe(INTEGRITY_BASELINE);
  });
});

describe("regressions found by adversarial review — these must never come back", () => {
  it("CRITICAL: a capped completion grants NO domain progress, so materials can't be farmed", () => {
    // Fill the week's ceiling, then tap 200 TRIVIALs. Previously
    // domainGainFromXp floored at 1, so each capped tap still added a
    // domain point — the cap held for XP but not for the bars, and
    // Requisite materials read the raw domain value.
    const capped: SystemEvent[] = Array.from({ length: 6 }, (_, i) =>
      completed(`s${i}`, 0, "vitality", "SEVERE"),
    );
    const atCap = reduce(capped);
    expect(atCap.totalXp).toBe(WEEKLY_XP_CAP);

    const farm: SystemEvent[] = Array.from({ length: 200 }, (_, i) =>
      completed(`f${i}`, 0, "vitality", "TRIVIAL"),
    );
    const after = reduce([...capped, ...farm]);
    expect(after.totalXp).toBe(WEEKLY_XP_CAP);
    expect(after.domainsRaw.vitality).toBe(atCap.domainsRaw.vitality);

    // ...and therefore the requisite gate stays shut.
    expect(
      evaluateRequisites(
        [{ kind: "material", domain: "vitality", amount: 200 }],
        after,
        [...capped, ...farm],
      ).met,
    ).toBe(false);
  });

  it("a TRIVIAL quest is still worth a domain point when XP is actually banked", () => {
    expect(domainGainFromXp(XP_BY_DIFFICULTY.TRIVIAL)).toBe(1);
    expect(domainGainFromXp(0)).toBe(0);
  });

  it("MAJOR: NOT YET pays Integrity once per quest, not once per tap", () => {
    const declines: SystemEvent[] = Array.from({ length: 30 }, (_, i) => ({
      type: "claim_declined",
      id: `d${i}`,
      timestamp: iso(i),
      questId: "m-same",
    }));
    expect(reduce(declines).integrity).toBe(
      INTEGRITY_BASELINE + INTEGRITY_GAIN_ON_DECLINE,
    );
    // Distinct quests are distinct acts of honesty and still each count.
    const twoQuests: SystemEvent[] = [
      { type: "claim_declined", id: "a", timestamp: iso(0), questId: "m1" },
      { type: "claim_declined", id: "b", timestamp: iso(1), questId: "m2" },
    ];
    expect(reduce(twoQuests).integrity).toBe(
      INTEGRITY_BASELINE + 2 * INTEGRITY_GAIN_ON_DECLINE,
    );
  });

  it("MAJOR: the weekly cap follows the player's local week, not UTC's", () => {
    // A player at UTC-10. Both instants sit in ONE local week
    // (Mon 5 Jan - Sun 11 Jan local), but the Sunday-night one lands in the
    // NEXT ISO week once read in UTC, which is how the old UTC bucketing
    // handed out two ceilings inside a single local week.
    const mondayLocal = new Date(Date.UTC(2026, 0, 5, 22, 0, 0)).toISOString();
    const sundayNightLocal = new Date(Date.UTC(2026, 0, 12, 9, 0, 0)).toISOString();
    const mk = (id: string, ts: string): SystemEvent => ({
      type: "quest_completed",
      id,
      timestamp: ts,
      domain: "craft",
      difficulty: "SEVERE",
    });
    const events = [
      ...Array.from({ length: 6 }, (_, i) => mk(`a${i}`, mondayLocal)),
      ...Array.from({ length: 6 }, (_, i) => mk(`b${i}`, sundayNightLocal)),
    ];
    // One local week, therefore exactly one ceiling.
    expect(reduce(events, new Date(sundayNightLocal), -600).totalXp).toBe(
      WEEKLY_XP_CAP,
    );
    // Read in UTC the same events straddle two weeks and pay two ceilings —
    // the behaviour the fix removes for the player's own timezone.
    expect(reduce(events, new Date(sundayNightLocal), 0).totalXp).toBe(
      2 * WEEKLY_XP_CAP,
    );
  });

  it("MINOR: undoing an earlier day's completion never reports negative XP today", () => {
    const events: SystemEvent[] = [
      completed("old", 0, "craft", "HARD"),
      completed("today", 3, "craft", "STANDARD"),
      {
        type: "completion_retracted",
        id: "u1",
        timestamp: iso(3),
        retractsEventId: "old",
      },
    ];
    const report = buildDayReport(events, new Date(iso(3)), 0);
    expect(report.xpToday).toBe(XP_BY_DIFFICULTY.STANDARD);
    expect(report.xpToday).toBeGreaterThanOrEqual(0);
    expect(report.completionsToday).toBe(1);
  });

  it("MINOR: an undone completion cannot bridge or manufacture an absence", () => {
    const byKey = Object.fromEntries(TITLE_DEFS.map((t) => [t.key, t]));
    // The mid-gap completion is undone, so a real 8-day absence remains.
    const events: SystemEvent[] = [
      completed("a", 0, "vitality", "STANDARD"),
      completed("bridge", 4, "vitality", "STANDARD"),
      completed("b", 8, "vitality", "STANDARD"),
      {
        type: "completion_retracted",
        id: "u1",
        timestamp: iso(4),
        retractsEventId: "bridge",
      },
    ];
    expect(byKey["returned"].earned(reduce(events), events)).toBe(true);
  });

  it("MINOR: an unprepared claim is stated plainly in the Chronicle", () => {
    const entries = chronicleEntries(
      [
        {
          type: "claim_verified",
          id: "m1",
          timestamp: iso(0),
          domain: "vitality",
          difficulty: "SEVERE",
          evidence: "ran it",
          questId: "m-half",
          unprepared: true,
        },
      ],
      {},
      0,
    );
    expect(entries[0].text).toContain("Preparation was not on file");
  });
});

describe("progress_reset — a replay boundary, never a deletion", () => {
  const before: SystemEvent[] = [
    completed("a", 0, "vitality", "SEVERE"),
    completed("b", 1, "craft", "HARD"),
    { type: "claim_declined", id: "d1", timestamp: iso(1), questId: "m1" },
  ];
  const reset: SystemEvent = { type: "progress_reset", id: "r1", timestamp: iso(2) };

  it("returns the character to a Level 1 blank slate", () => {
    const state = reduce([...before, reset], new Date(iso(2)));
    expect(state.totalXp).toBe(0);
    expect(state.level).toBe(1);
    expect(state.gold).toBe(0);
    expect(state.integrity).toBe(INTEGRITY_BASELINE);
    expect(state.domainsRaw.vitality).toBe(0);
    expect(state.lastActiveAt).toBeNull();
  });

  it("keeps counting normally after the boundary", () => {
    const state = reduce(
      [...before, reset, completed("c", 3, "mind", "STANDARD")],
      new Date(iso(3)),
    );
    expect(state.totalXp).toBe(XP_BY_DIFFICULTY.STANDARD);
    expect(state.domainsRaw.mind).toBe(domainGainFromXp(XP_BY_DIFFICULTY.STANDARD));
    expect(state.domainsRaw.vitality).toBe(0);
  });

  it("does not erase history — the events are still in the log", () => {
    // The point of a boundary over a delete: event_log has no DELETE
    // policy, and the audit trail must survive a reset.
    const all = [...before, reset];
    expect(all.filter((e) => e.type === "quest_completed")).toHaveLength(2);
  });

  it("clears the Chronicle, Ledger and reports to match the character", () => {
    const all = [...before, reset];
    expect(chronicleEntries(all, {}, 0)).toHaveLength(0);
    expect(buildLedger(all, 0)).toEqual({
      daysActive: 0,
      questsCompleted: 0,
      milestonesClaimed: 0,
      timesHeldBack: 0,
    });
    expect(buildWeekReport(all, new Date(iso(2)), 0).thisWeek).toBe(0);
    expect(buildDayReport(all, new Date(iso(2)), 0).xpToday).toBe(0);
  });

  it("honours only the MOST RECENT reset", () => {
    const events: SystemEvent[] = [
      completed("a", 0, "vitality", "SEVERE"),
      { type: "progress_reset", id: "r1", timestamp: iso(1) },
      completed("b", 2, "craft", "HARD"),
      { type: "progress_reset", id: "r2", timestamp: iso(3) },
      completed("c", 4, "mind", "TRIVIAL"),
    ];
    expect(reduce(events, new Date(iso(4))).totalXp).toBe(XP_BY_DIFFICULTY.TRIVIAL);
  });

  it("grants nothing by itself and does not count as activity", () => {
    const state = reduce([reset], new Date(iso(2)));
    expect(state.totalXp).toBe(0);
    expect(state.integrity).toBe(INTEGRITY_BASELINE);
    expect(state.lastActiveAt).toBeNull();
  });
});

describe("the AI boundary is structurally enforced, not just documented", () => {
  it("no engine file imports the AI layer, now that one exists", () => {
    const dir = new URL("./", import.meta.url);
    for (const file of [
      "reducer.ts",
      "rules.ts",
      "chronicle.ts",
      "titles.ts",
      "requisites.ts",
      "events.ts",
      "domains.ts",
    ]) {
      const source = readFileSync(new URL(file, dir), "utf8");
      expect(source.includes("lib/ai")).toBe(false);
      expect(source.includes("@/lib/ai")).toBe(false);
    }
  });

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

  // chronicle.ts and titles.ts are held to the same standard: the
  // System's voice and its granted nouns are deterministic — an AI may
  // later rephrase what they derive, but the derivation itself must
  // never reach for a network, randomness, or an LLM. (Loot's
  // Math.random lives in lib/loot.ts, outside the engine, by design.)
  for (const file of ["reducer.ts", "rules.ts", "chronicle.ts", "titles.ts", "requisites.ts"]) {
    it(`${file} contains no network I/O, randomness, or AI-client imports`, () => {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      for (const needle of forbidden) {
        expect(source.toLowerCase().includes(needle.toLowerCase())).toBe(false);
      }
    });
  }
});
