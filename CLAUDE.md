# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # dev server (Turbopack)
npm run build    # production build — forced to webpack, see note below
npm run start    # serve the production build
npm run lint      # eslint (eslint-config-next: core-web-vitals + typescript)
npx tsc --noEmit  # type check only, no separate script defined
npm test          # vitest — currently covers lib/engine/ only
```

There is no UI test suite in the repo. Verify UI changes by building, starting
the production server, and driving it with a real browser (Playwright or
manual) — don't trust `next dev`'s live-reload preview alone, and don't trust
a plain `npm run build` success as proof the UI works; it only proves it
compiles. Note that anything touching Supabase (auth, quest completion, the
event log) cannot be exercised end-to-end from a sandboxed environment without
outbound network access to `*.supabase.co` — verify those paths against a real
deployment.

**Build is forced to webpack** (`next build --webpack` in package.json).
Turbopack has documented `NEXT_PUBLIC_*` env-var inlining regressions on
Vercel's build pipeline (Next.js 15.3+, notably under the standalone-output
packaging path); `next dev` is unaffected and stays on Turbopack.

Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see
`.env.local.example`). No service role key needed anywhere in this repo — every
table is RLS-scoped to `auth.uid()`, so the anon key plus a user's session is
sufficient. See `db/README.md` for applying the schema/policies to a fresh
Supabase project.

## Architecture

**Phase 1 in progress** — see `DESIGN.md` (canonical product spec) and
`AGENTS.md` (the short version: covenant, tone, AI boundary, life model,
design invariants). Phase 0's fake data (`lib/data.ts`) is gone; auth, the
database, and real progression are wired. Not yet built: the AI Induction
interview (needs a separate Anthropic Console account — deliberately deferred,
see the AI boundary in `AGENTS.md`), vices, Measures, seasons — all Phase 2+
per `DESIGN.md`.

### The progression engine (`lib/engine/`) — read this before touching XP/level/Integrity anywhere

This is the one part of the app the AI boundary applies to literally: nothing
here may depend on network I/O, randomness, or an LLM, and `reducer.test.ts`
statically greps `reducer.ts`/`rules.ts` for exactly that on every test run.

- **`events.ts`** — `SystemEvent`, a closed union of four shapes
  (`quest_completed`, `claim_verified`, `claim_declined`, `claim_retracted`).
  This is the append-only log — never store a computed total, store what
  happened.
- **`reducer.ts`** — `reduce(events, now)` is a pure function that replays the
  log into a `CharacterState` (level, XP, Integrity, domains, tier). The
  **same function runs on the client and the server**: the client appends an
  optimistic event and re-runs `reduce()` for instant, exactly-correct UI
  feedback, while a Server Action persists the real event. This is not a
  duplicated implementation — it's the same module imported in both places, so
  there's no way for the two to drift.
- **`rules.ts`** — every tunable number (`XP_BY_DIFFICULTY`, the weekly XP
  cap, the level curve, decay rates, tier thresholds, `TIER_NAMES`). Isolated
  here on purpose so a future move to DB-backed, versioned config rows (Phase
  2, "balance tweaks must not require a deploy") is a relocation, not a
  rewrite.
- **`domains.ts`** — `DomainKey`, `DOMAIN_KEYS`, and `DOMAIN_DISPLAY` (label/
  colour/description). Deliberately independent of the old `lib/data.ts` —
  the engine never depended on Phase 0's fake data, and now nothing does.

### Data flow: Server Component → Client Component → Server Actions

- **`app/page.tsx`** — async Server Component. Gets the authenticated user,
  upserts their `profiles` row (first-visit bootstrap — no Induction yet, so
  everyone starts at Level 1 / all domains at 0, which is correct per "Level 1
  must feel weak"), fetches `quests` and `event_log`, maps rows to
  `SystemEvent[]` via `db/mappers.ts`, and renders `StatusWindowClient`.
- **`components/StatusWindowClient.tsx`** — owns all interactive state.
  Mirrors Phase 0's animation choreography (optimistic update → toast → check
  for a level/tier crossing → overlay) but every number now comes from
  `reduce()` over real events, not ad-hoc arithmetic. On a Server Action
  failure, it reverts the optimistic event by id and surfaces
  `[ REJECTED ] <reason>` via the same toast mechanism used for XP gains.
- **`app/actions.ts`** — the entire write surface for progression
  (`completeQuest`, `verifyClaim`, `declineClaim`, `createQuest`, `signOut`).
  Every action re-derives the acting user from the session server-side; never
  trusts a client-supplied `user_id`. `completeQuest` explicitly refuses
  `weighty` quests — those must go through `verifyClaim`/`declineClaim`.
- **`middleware.ts`** — refreshes the Supabase session on every request and
  gates everything except `/login` and `/auth/*`. Deliberately added in a
  later commit than the login page itself — flipping the gate on before
  `/login` was proven to reach Supabase would have broken the live site behind
  a wall nobody could get through.

### Database (`db/`)

- **`schema.ts`** — Drizzle schema, used for migration generation only;
  nothing at runtime queries through Drizzle. All runtime reads/writes go
  through `@supabase/supabase-js`, which returns raw **snake_case** column
  names — `db/mappers.ts`'s `EventRow`/`QuestRow` types reflect that
  deliberately, not the camelCase Drizzle would produce.
- **`policies.sql`** — RLS. `event_log` gets `INSERT`/`SELECT` policies and
  **no `UPDATE`/`DELETE` policy for any role**, including the row's own
  owner — that omission is what makes the honesty system's audit trail
  provable. `quests` allows delete only while `status = 'active'`.
- **`mappers.ts`** — `rowToEvent()` bridges a raw `event_log` row to the
  `SystemEvent` union; throws on an unrecognized `type` rather than silently
  dropping it.
- **`README.md`** — how to apply the schema/policies to a fresh project, and
  how the policies were behaviourally verified (real local Postgres, stub
  `auth.uid()`, two simulated users) before ever reaching production.

### Auth (`lib/supabase/`, `app/login/`, `app/auth/callback/`)

Magic link only — no password, no OAuth app to register. `lib/supabase/
client.ts` / `server.ts` are the standard `@supabase/ssr` browser/server split.
`app/login/page.tsx` is styled in the System's voice, not a generic form.

### `app/layout.tsx` / `app/globals.css`

Unchanged from Phase 0. Three fonts via `next/font` mapped to
`--font-display` / `--font-sys` / `--font-body`; the entire design system
(palette, easing, named `.animate-*` classes tied to specific `@keyframes`)
lives in `globals.css` as a Tailwind v4 `@theme` block. New UI should reuse
these tokens rather than introducing new colours or one-off transitions.
`prefers-reduced-motion` is handled globally there.

### Components (`components/`)

- **`Panel.tsx`** — the System-window shell used for every panel: the
  delayed scan-in reveal, the bracket-corner frame, the `"panel"` sound cue
  on reveal. Build new panel-like UI as children of this, not a bespoke `<div>`.
- **`CountUp.tsx`** — animated tabular-number counter; reads
  `useReducedMotion()` to skip animation and render the raw value instead.
- **`StatBar.tsx`** — a domain bar. `trend` is optional and only rendered
  when present — showing a fabricated "+0" before seasons (Phase 2) exist
  would be exactly the "confidently wrong number" `DESIGN.md`'s Measures
  section warns against, so `app/page.tsx` doesn't pass one yet.
- **`Avatar.tsx`** — still the Phase-0 placeholder silhouette (real
  illustrated tiers are Phase 2). The figure stays System-cyan regardless of
  dominant domain; only the aura glow takes the domain colour. `decay` prop
  now driven by real `daysAbsent` from the reducer.
- **`LevelUpOverlay.tsx`** / **`TierUpOverlay.tsx`** — both implement the
  "beat of silence before the reveal" sequencing. `TierUpOverlay` no longer
  hardcodes a day count ("Earned across 187 days" was Phase 0 flavour text
  that became a fabricated number once real data existed — removed).
- **`VerificationScreen.tsx`** — the honesty-system UI. Only for `weighty`
  quests. Now typed against `QuestRow` from `db/mappers.ts`, not the deleted
  `lib/data.ts`.

### Sound, haptics, and external state (`lib/`)

- **`lib/sound.ts`** — all audio synthesized with the Web Audio API; no audio
  files in the repo. Mute state is **not** React state — it lives in a small
  module-level store (`subscribeMuted`/`isMuted`/`setMuted`), because
  mirroring `localStorage` into `useState` via an effect trips ESLint's
  `react-hooks/set-state-in-effect` rule and fails the build.
- **`lib/haptics.ts`** — `navigator.vibrate` patterns, gated by the same mute
  flag from `lib/sound.ts`.
- **`lib/hooks.ts`** — `useMuted()` and `useReducedMotion()`, both via
  `useSyncExternalStore`. The pattern to follow for any future external state.

### Conventions

- Path alias `@/*` → repo root (`tsconfig.json`).
- `.tnum` class on any number that animates, so tabular figures don't
  jitter — `CountUp` already applies it.
- `data-testid` on anything a test/automation script needs to drive.
- Never write to `event_log` from anywhere except `app/actions.ts`. Never let
  an AI-touched code path write XP, level, or Integrity — see the AI boundary
  in `AGENTS.md`.
