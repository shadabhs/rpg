import "server-only";

/**
 * The AI layer's single exit point. Server-only — the key never reaches a
 * browser — and deliberately provider-agnostic: every candidate free tier
 * (Groq, NVIDIA NIM, OpenRouter, Together) speaks the OpenAI chat
 * completions shape, so switching providers is two env vars, not a
 * rewrite.
 *
 * Default is Groq: a genuinely free tier with no card required, the
 * fastest inference available, and Llama 3.3 70B — more than enough to
 * conduct an interview.
 *
 * THE AI BOUNDARY (AGENTS.md) APPLIES ABSOLUTELY HERE: this module may
 * produce words — questions, phrasing, proposed structure. It may never
 * produce a number that touches progression. Nothing in lib/engine/ may
 * ever import this file, and reducer.test.ts statically enforces that.
 */

const BASE_URL = process.env.AI_BASE_URL ?? "https://api.groq.com/openai/v1";
const MODEL = process.env.AI_MODEL ?? "llama-3.3-70b-versatile";
const API_KEY = process.env.AI_API_KEY;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function aiConfigured(): boolean {
  return typeof API_KEY === "string" && API_KEY.length > 0;
}

export class AiUnavailable extends Error {}

/**
 * One chat completion. Throws AiUnavailable on any failure — the caller
 * degrades to a scripted path rather than showing the player a stack
 * trace, because the interview must survive a provider outage.
 */
export async function chat(
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number } = {},
): Promise<string> {
  if (!API_KEY) throw new AiUnavailable("No AI key configured.");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.7,
        max_tokens: opts.maxTokens ?? 700,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AiUnavailable("The provider could not be reached.");
  }

  if (!res.ok) {
    throw new AiUnavailable(`Provider returned ${res.status}.`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new AiUnavailable("The provider returned nothing usable.");
  }
  return text;
}
