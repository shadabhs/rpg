import {
  GOLD_BY_DIFFICULTY,
  DROP_CHANCE_BY_DIFFICULTY,
  ITEM_TABLE,
  type Difficulty,
} from "@/lib/engine/rules";

/**
 * The one place chance lives. Deliberately OUTSIDE lib/engine/ — the
 * reducer replays rolled results stored on events and must stay
 * deterministic (its test statically greps for Math.random). This module
 * is called exactly once per completion, server-side in app/actions.ts,
 * and the outcome is written into the event row. Never call it from the
 * client: an unrolled optimistic event shows no loot rather than a
 * fabricated guess.
 */
export function rollLoot(difficulty: Difficulty): {
  gold: number;
  item: string | null;
} {
  const { min, max } = GOLD_BY_DIFFICULTY[difficulty];
  const gold = min + Math.floor(Math.random() * (max - min + 1));

  let item: string | null = null;
  if (Math.random() < DROP_CHANCE_BY_DIFFICULTY[difficulty]) {
    const table = ITEM_TABLE[difficulty];
    item = table[Math.floor(Math.random() * table.length)];
  }

  return { gold, item };
}
