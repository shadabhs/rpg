# THE SYSTEM

A life RPG. Your character is you, quests are your real goals, and progression is earned
only by real-world action.

> The goal of the game is not to play the game. The goal is to help you play the game of
> life — and to keep you honest with reality while you do.

**Status: Phase 0 — the feel test.**

Fake data, no account, no database, no AI, no real art. Its only job is to answer one
question: *does the loop feel good and does the tone land?* It is disposable by intent —
most of this gets replaced in Phase 1.

## What's in it

- **Status Window** — placeholder silhouette avatar with live aura, six domain bars,
  Integrity, level and proximity to the next one
- **Today** — one-tap quest completion, each with a *when and where*
- **Verification Screen** — the honesty challenge, on milestones only
- **Level-up** — with the beat of silence before the number changes
- **Tier transformation** — the moment Phase 0 exists to test
- **Real-World Ledger** — what actually changed, above the game
- **Day closed** — the app tells you to leave

Sound and haptics are on by default with a one-tap mute. All five sounds are synthesized
with the Web Audio API, so there are no audio files.

## Try it

Nothing to install locally — push to GitHub and Vercel builds it. To run it here anyway:

```bash
npm install
npm run dev
```

Then open it on your phone and use **⋮ → Install app** to put it on your home screen.

## Docs

- **[DESIGN.md](./DESIGN.md)** — the decision record. Canonical. Read before making product
  decisions.
- **[AGENTS.md](./AGENTS.md)** — the short version: covenant, AI boundary, tone spec, and
  the invariants most likely to be broken by accident.
