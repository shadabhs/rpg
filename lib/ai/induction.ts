import "server-only";
import { chat, type ChatMessage } from "./client";
import { DOMAIN_KEYS } from "@/lib/engine/domains";

/**
 * The Induction interview — the AI's largest job, and a strict
 * demonstration of the AI boundary: it writes the STORY (questions,
 * phrasing, proposed structure) and never the NUMBERS.
 *
 * Specifically, the model may propose epics and quests. It may not set
 * XP, levels, domains or Integrity — a new character starts at Level 1
 * with every domain at zero regardless of what it says, because "Level 1
 * must feel weak" and progression is earned only by real action. The
 * proposal is also sanitised field-by-field before anything is written.
 */

const SYSTEM_PROMPT = `You are THE SYSTEM: a cold, precise, respectful instrument from a dark-fantasy life RPG. You are interviewing a new subject.

VOICE — non-negotiable:
- Never cheerful, never flattering, never encouraging. No exclamation marks. No emoji.
- You state facts and ask direct questions. You take the person seriously.
- Short. Two or three sentences maximum per turn, then one question.
- Never congratulate them for answering. Never say "great" or "thanks for sharing".

YOUR TASK:
Conduct a brief induction — about six to eight exchanges. Establish, in this order:
1. Their situation right now, plainly.
2. What they actually want to change, in their own words.
3. What has stopped them before.
4. What is genuinely fixed in their life (time, obligations, health).
5. One or two concrete things they could do THIS WEEK.

Probe where there is energy or pain. Do not interview all six life domains mechanically. Never promise outcomes. Never give medical, legal or financial advice — if something needs a professional, say so plainly and move on.

The six domains are: VITALITY (body), MIND (inner life), CRAFT (work and means), BONDS (relationships), SPIRIT (meaning), VIRTUE (character).

When you have enough — and not before — reply with exactly the token [READY] on its own final line.`;

const PLAN_PROMPT = `From the interview, propose a starting structure. Reply with JSON only:

{
  "statement": "Two or three sentences, in the System's cold voice, stating this person's situation back to them. No comfort, no promises. This is the last thing they read before the window opens.",
  "epics": [{ "title": "...", "intent": "their own words for why it matters", "domain": "vitality|mind|craft|bonds|spirit|virtue" }],
  "quests": [{ "title": "...", "domain": "vitality|mind|craft|bonds|spirit|virtue", "difficulty": "TRIVIAL|STANDARD|HARD|SEVERE", "whenText": "a specific time", "whereText": "a specific place", "cadence": "daily|once", "epicIndex": 0 }]
}

RULES:
- At most 2 epics and at most 4 quests. Fewer is better. A person who starts with three real habits keeps them; a person who starts with ten keeps none.
- Every quest MUST have a concrete when and where. "Morning" is not a time. "06:40" is.
- Difficulty reflects real effort, and is fixed forever at creation — never inflate it.
- epicIndex refers to your epics array, or omit it for a standalone quest.
- Quests must be about the person's own ACTIONS, never another person's response.`;

export type InductionPlan = {
  statement: string;
  epics: { title: string; intent: string; domain: string }[];
  quests: {
    title: string;
    domain: string;
    difficulty: string;
    whenText: string;
    whereText: string;
    cadence: string;
    epicIndex?: number;
  }[];
};

/** One interview turn. Returns the System's next line, and whether it
 *  considers the interview finished. */
export async function interviewTurn(
  history: ChatMessage[],
): Promise<{ text: string; ready: boolean }> {
  const raw = await chat([{ role: "system", content: SYSTEM_PROMPT }, ...history], {
    maxTokens: 300,
  });
  const ready = raw.includes("[READY]");
  return { text: raw.replace("[READY]", "").trim(), ready };
}

const DIFFICULTIES = new Set(["TRIVIAL", "STANDARD", "HARD", "SEVERE"]);
const DOMAINS = new Set<string>(DOMAIN_KEYS);
const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/**
 * Ask for the structure, then rebuild it field by field. Anything the
 * model returns that isn't a recognised domain or difficulty is
 * corrected to a safe default rather than trusted — the model proposes,
 * this function decides.
 */
export async function buildPlan(history: ChatMessage[]): Promise<InductionPlan> {
  const raw = await chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: PLAN_PROMPT },
    ],
    { json: true, maxTokens: 1200 },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const p = (parsed ?? {}) as Record<string, unknown>;

  const epics = (Array.isArray(p.epics) ? p.epics : [])
    .slice(0, 2)
    .map((e) => {
      const r = (e ?? {}) as Record<string, unknown>;
      return {
        title: str(r.title, 120),
        intent: str(r.intent, 300),
        domain: DOMAINS.has(String(r.domain)) ? String(r.domain) : "craft",
      };
    })
    .filter((e) => e.title);

  const quests = (Array.isArray(p.quests) ? p.quests : [])
    .slice(0, 4)
    .map((q) => {
      const r = (q ?? {}) as Record<string, unknown>;
      const idx = Number(r.epicIndex);
      return {
        title: str(r.title, 120),
        domain: DOMAINS.has(String(r.domain)) ? String(r.domain) : "craft",
        difficulty: DIFFICULTIES.has(String(r.difficulty))
          ? String(r.difficulty)
          : "STANDARD",
        whenText: str(r.whenText, 60) || "Choose a time",
        whereText: str(r.whereText, 60) || "Choose a place",
        cadence: r.cadence === "once" ? "once" : "daily",
        epicIndex:
          Number.isInteger(idx) && idx >= 0 && idx < epics.length ? idx : undefined,
      };
    })
    .filter((q) => q.title);

  return {
    statement:
      str(p.statement, 600) ||
      "Level 1. Every domain at zero. Nothing is known about you yet. That is accurate.",
    epics,
    quests,
  };
}
