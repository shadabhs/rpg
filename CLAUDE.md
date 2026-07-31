# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # dev server
npm run build    # production build (also runs the TS type check)
npm run start    # serve the production build
npm run lint      # eslint (eslint-config-next: core-web-vitals + typescript)
npx tsc --noEmit  # type check only, no separate script defined
```

There is no test suite in the repo. Verify UI changes by building, starting the
production server, and driving it with a real browser (Playwright or manual) —
don't trust `next dev`'s live-reload preview alone, and don't trust a plain
`npm run build` success as proof the UI works; it only proves it compiles.

No environment variables are required. No database, auth, or API keys exist yet.

## Architecture

**This is Phase 0 of a multi-phase build** — see `DESIGN.md` (canonical product
spec) and `AGENTS.md` (the short version: covenant, tone, AI boundary, life
model, design invariants). Phase 0 is fake data only, disposable by intent, and
most of it gets replaced in Phase 1. `lib/data.ts` is fake and must not be
imported once real data exists.

The whole app is currently one client-rendered screen:

- **`app/page.tsx`** — the Status Window. Owns all state (quests, domains,
  level, XP, tier, Integrity, toasts) and orchestrates which overlay is
  showing. Everything else is presentational, driven by props from here.
- **`app/layout.tsx`** — loads three fonts via `next/font` and maps them to the
  CSS variables consumed by `globals.css`: Rajdhani → `--font-display`
  (headers), JetBrains Mono → `--font-sys` (System/terminal voice), Inter →
  `--font-body`.
- **`app/globals.css`** — the entire design system lives here as a Tailwind v4
  `@theme` block: the palette (`--color-void`, `--color-sys`, one colour per
  life domain like `--color-vitality`, the rarity ladder, `--color-integrity`),
  the two easing curves, and named `.animate-*` classes tied to specific
  `@keyframes` (`panel-resolve`, `scan-sweep`, `aura-breathe`, `flare`,
  `drift-up`, `shake`, `edge-pulse`). New UI should reuse these tokens and
  animation classes rather than introducing new colours or one-off transitions.
  `prefers-reduced-motion` is handled globally here by collapsing all
  animation/transition durations to ~0.

### Components (`components/`)

- **`Panel.tsx`** — the System-window shell used for every panel on screen:
  handles the delayed scan-in reveal (`animate-panel` + `animate-scan`), the
  bracket-corner frame, and plays the `"panel"` sound cue once on reveal. Any
  new panel-like UI should be built as children of this, not a bespoke `<div>`.
- **`CountUp.tsx`** — animated tabular-number counter; reads
  `useReducedMotion()` to skip animation and render the raw value instead.
- **`StatBar.tsx`** — a single domain bar (fill + overshoot + leading edge of
  light).
- **`Avatar.tsx`** — the Phase-0 placeholder character: a hand-built SVG
  silhouette with 5 tiers. The figure itself stays System-cyan
  (`FIGURE` constant) regardless of dominant domain; only the aura glow behind
  it takes the domain colour — tinting the whole figure was tried and reads as
  a coloured blob, not a character. Tier 1 is deliberately unremarkable per the
  "avatar may never depict something you haven't earned" rule in `AGENTS.md`.
- **`LevelUpOverlay.tsx`** / **`TierUpOverlay.tsx`** — both implement the same
  "beat of silence before the reveal" sequencing (dim → hold → reveal), just
  with different content. Sound/haptics fire on reveal, not on trigger.
- **`VerificationScreen.tsx`** — the honesty-system UI (see `AGENTS.md`). Only
  shown for `weighty` quests (milestones/epics), never for daily quests.

### Sound, haptics, and external state (`lib/`)

- **`lib/sound.ts`** — all audio is synthesized with the Web Audio API
  (oscillators/noise buffers); there are no audio files in the repo. Mute state
  is **not** React state — it lives in a small module-level store with a
  `Set` of listeners (`subscribeMuted`/`isMuted`/`setMuted`), because mirroring
  `localStorage` into `useState` via an effect trips ESLint's
  `react-hooks/set-state-in-effect` rule and fails the build.
- **`lib/haptics.ts`** — `navigator.vibrate` patterns, gated by the same mute
  flag from `lib/sound.ts`.
- **`lib/hooks.ts`** — `useMuted()` and `useReducedMotion()`, both implemented
  with `useSyncExternalStore` against a browser API/store rather than
  `useState` + `useEffect`. This is the pattern to follow for any future
  external state (media queries, localStorage, etc.) — see the comment at the
  top of the file for why.

### Conventions

- Path alias `@/*` → repo root (`tsconfig.json`).
- `.tnum` class (defined in `globals.css`) on any number that animates, so
  tabular figures don't jitter — `CountUp` already applies it.
- `data-testid` on anything a test/automation script needs to drive (see
  existing `quest-*`, `tier-up` testids in `app/page.tsx`).
