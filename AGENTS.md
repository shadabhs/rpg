<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# THE SYSTEM

A life RPG. The character is you, quests are real goals, progression is earned
only by real-world action.

**Read `DESIGN.md` before making product decisions.** It is the decision record
and it is canonical. This file is the short version — the rules most likely to
be violated by accident.

## The thesis

> The goal of the game is not to play the game. The goal is to help you play the
> game of life — and to keep you honest with reality while you do.

When a feature is debated, the test is: **does this make someone spend more time
in the app, or more time in their life?** If it's the former, cut it — even if it
would improve retention.

## The covenant — never violate

> Character power is earned only by real-world action. There is no other path.

- No buying XP, levels, gold, or power. Cosmetics only, if ever monetized.
- No passive or idle gains. No ads-for-currency.
- Difficulty is declared **at quest creation**, never at completion.
- Weekly XP ceiling, so trivial quests can't be farmed.
- **No AI-determined rewards.** Ever.

## The AI boundary

> **AI writes the story. Deterministic code writes the numbers.**

AI handles: the Induction interview, goal decomposition, the Life Codex, drift
detection, honesty-challenge wording.

AI never touches: XP amounts, level thresholds, loot rolls, stat gains, decay.
Those are pure, server-side, unit-tested functions. If an LLM decides rewards,
the economy can't be balanced, can't be tested, and the covenant collapses.

## Tone — the most-violated rule

The System is **not a cheerleader**. It is a cold, precise, respectful instrument
that takes the player seriously. It never flatters and never celebrates app usage.

- ❌ "🎉 30 day streak! You're on fire!"
- ✅ `[RECORD] Trained 30 consecutive days. Last year's best: 11.`

Rules: never celebrate engagement · report reality, not encouragement · every
session has a defined end (`[COMPLETE] Nothing left today. Close this.`) · low
session time is a virtue · no fake urgency, invented scarcity, or guilt.

## The life model

Six domains, **maximum**. Richness lives at the facet level, never by adding bars.

`VITALITY` (body) · `MIND` (inner life) · `CRAFT` (work/means) · `BONDS`
(relationships) · `SPIRIT` (meaning) · `VIRTUE` (character)

Plus `INTEGRITY` — a meta-stat. **Never interviewed**, starts at a neutral
baseline, **only ever rises, never falls**. The System cannot detect a lie, so it
must never punish a suspected one; it can only reward honesty it has witnessed.

Hierarchy: **Domain → Facet → Epic → Milestone → Habit/Quest**

> Virtue is how you treat other people. Integrity is how you treat the truth.

## Design invariants

- **Fixed XP, variable loot.** XP is known before you start — progress is an
  honest mirror. Only the garnish (gold, items) is random.
- **Always show proximity**, never raw totals. "80% to Level 6", not "4,200 XP".
- **Quests capture when and where**, not just what (implementation intentions).
- **Level 1 must feel weak.** A character that starts strong has nowhere to go.
  This will be tempting to soften. Don't.
- **Relapse costs nothing; reporting it is rewarded.** Penalty → shame →
  concealment → the honesty system dies.
- **Measures: encode the delta, display the stock.** A bank balance is a reading,
  never an achievement — otherwise inherited money becomes power. Contributions
  earn XP; valuations never do (market movement is not an action). Privacy is
  per-measure, and a derived readout inherits the strictest privacy of its
  inputs, or an ungated Runway leaks a gated Liquid.
- **Bonds quests are about your actions, never outcomes** you don't control.
- **The avatar may never depict something you haven't earned.**

## Motion and sound

One gesture language: panels resolve behind a scan line (~340ms) · numbers count,
never jump · bars overshoot and settle · **level-up holds a beat of silence before
the number changes** — the pause before the payoff is the payoff · easing is sharp
and decisive, never bouncy.

Sound is synthesized via Web Audio (`lib/sound.ts`) — no audio files. Default on,
one-tap mute, shared with haptics.

Anti-cheap: no instant state changes · no default system fonts · no flat colour
without depth · no emoji as icons · no uniform sizing.

## Current state

**Phase 0 — the feel test.** Fake data only, no auth, no database, no AI, no real
art. Its only job is to answer: does the loop feel good and does the tone land?
It is **disposable by intent** — most of it gets replaced in Phase 1.

`lib/data.ts` is fake and should not be imported after Phase 0.

## Conventions

- Next.js App Router, TypeScript, Tailwind v4 (`@theme` tokens in `app/globals.css`).
- Design tokens over literals: `text-sys`, `bg-panel`, `border-edge`, `text-integrity`.
- `.tnum` on any number that changes, so counting doesn't jitter.
- Respect `prefers-reduced-motion`; never encode status in colour alone.
- `data-testid` on anything a test needs to drive.
