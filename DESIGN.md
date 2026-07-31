# The System — Design Decisions & Build Roadmap

> Status: design complete, no code written yet. This is the decision record.

## Context

A browser-based RPG where the character is you, quests are real goals, and progression is
earned only by real-world action. First user is the author; built so strangers can use it
later without a rewrite. Personal data means security and privacy are first-class.

**The thesis, and everything else follows from it:**

> The goal of the game is not to play the game. The goal is to help you play the game of
> life — and to keep you honest with reality while you do.

RPGs are the most effective engagement machines ever built, and they are mostly pointed at
nothing. This project points the same machinery at the player's actual life. That inversion
is the product. Every design decision is judged against it.

---

## Locked decisions

| Decision | Choice | Why |
|---|---|---|
| **Platform** | Web app, mobile-first, installable PWA | Habits need phone + push; epics and charts need desktop. One codebase, no store review, instant updates during the design-heavy phase. |
| **Game engine** | **None.** Plain web app. | Lists, forms, numbers, animation — no physics or realtime rendering. An engine breaks text input, accessibility, links, SEO for zero benefit. Phaser optional later for one map scene. |
| **Failure model** | Slow decay on absence only | Nothing for 3 days. Gentle rust after 7. Capped ~15%, never lose a level permanently. One-tap "I'm back." |
| **Character** | Life-domain attributes | Strength (fitness), Intellect (learning), Discipline (habits), Wealth (career), Spirit (health/mind), Charisma (relationships), **Integrity** (honesty). |
| **Content types** | All four | Daily habits · long-term epics with milestones · work/project tasks · measured numbers with targets. |
| **Social** | Solo now, architected for later | Private today; `visibility` flags and user-scoped schema from day one. |
| **Aesthetic** | Dark fantasy "System" (Solo Leveling) | Blue holographic panels, terminal notifications — `[QUEST COMPLETE]`, `[LEVEL UP]`. A system that plainly states what it is doing. Cheapest path to looking genuinely great (typography + glow, not illustration). |
| **AI layer** | Yes — narrative only, never numeric | See "The AI boundary". |
| **Interview transcript** | Derived then **discarded**; Codex kept encrypted | The transcript is a confession; the Codex is the useful distillate. Keeping only the Codex gives the System memory without the liability. |
| **Honesty enforcement** | Challenge big claims, not small ones | Dailies stay one-tap. Milestones, level-ups, epic completions get full verification. Audit everything and the user quits in a week. |
| **Goal** | Personal tool → real product → learning | Multi-user-ready underneath; don't polish for strangers yet. |

---

## The core covenant (non-negotiable)

> **Character power is earned only by real-world action. There is no other path.**

Forbidden forever, because every future feature will try to erode this:

- No buying XP, levels, gold, or power. Cosmetics only, if ever monetized.
- No passive or idle gains. No ads-for-currency.
- Difficulty declared **at quest creation**, never at completion.
- Weekly XP ceiling, so trivial quests can't be farmed.
- **No AI-determined rewards.** Ever.

---

## Tone: the System's voice

The single most-violated principle will be tone, so it gets its own spec.

**The System is not a cheerleader.** It is a cold, precise, respectful instrument that
takes the player seriously. It never flatters. It never celebrates app usage. It states
facts about reality.

| A normal app says | The System says |
|---|---|
| "🎉 30 day streak! You're on fire!" | `[RECORD] Trained 30 consecutive days. Last year's best: 11.` |
| "Welcome back! We missed you!" | `[STATUS] 9 days absent. Strength has rusted 6%. Nothing else was lost.` |
| "Keep going, you've got this!" | `[EPIC] 4 of 7 milestones. The next one is the hard one.` |
| "You've unlocked a badge!" | `[TITLE] The Unbroken. 90 days without a missed daily. 41 people have earned this.` |
| — | `[SESSION] 94 seconds. Close this and go do the thing.` |

Rules:

- **Never celebrate engagement.** No "you opened the app 30 days running." Streaks track
  real actions only. App usage is never shown as an achievement.
- **Report reality, not encouragement.** Numbers about the player's life, stated plainly.
  The player supplies motivation; the System supplies the mirror.
- **The app pushes you out.** Every session has a defined end: `[COMPLETE] Nothing left
  today. Close this.` No infinite scroll, no feed, no reason to linger.
- **Display session time as a virtue when it's low.** Radical, on-brand, and a permanent
  check on scope creep — any feature that raises time-in-app must justify itself.
- No fake urgency, invented scarcity, or guilt.

---

## The AI boundary

> **AI writes the story. Deterministic code writes the numbers.**

| AI does | AI never does |
|---|---|
| Induction interview (conversational, adaptive) | XP amounts |
| Goal decomposition — "get fit" → epic + milestones + dailies with *when and where* | Level thresholds |
| Maintaining the Life Codex | Loot rolls |
| Periodic re-interview and drift detection | Stat gains |
| Generating the specific honesty challenge for a claim | Decay math |

If an LLM decides rewards, three things break simultaneously: the economy can't be
balanced, it can't be unit-tested, and the covenant collapses because numbers become
negotiable. All progression math stays pure, server-side, and tested.

**Implementation:** Claude API, server-side only, key never in the client. Structured
output via tool use so the interview returns validated JSON, not prose to parse. Prompt
caching on the Codex context, which is resent every turn. Hard per-user rate limits — an
LLM endpoint is the most expensive thing an attacker can hit. Confirm current pricing at
build time rather than relying on remembered rates.

---

## Induction: the opening interview

Framed in-world as **Induction** — the System assessing a new subject. Not a signup form.

1. **Orientation** — the System states what it is and what it will not do. The Oath.
2. **Situation** — where you are right now. Work, health, money, relationships, mind.
3. **Domain sweep** — each attribute probed: current state, what you've tried, what stopped
   you. Adaptive: follows the thread where there's energy or pain.
4. **Aspiration** — what you actually want, on 1-year and 5-year horizons.
5. **Constraints** — time, money, health, obligations. What can't change.
6. **Decomposition** — the System proposes epics, milestones and starting dailies, each with
   a **when and where**. The player edits and confirms. Nothing is imposed.
7. **Manifestation** — starting attributes derived from the interview, not chosen. Cosmetics
   *are* chosen. The System states plainly why each stat landed where it did.

**Depth: ~10 minutes. One length, for everyone.** Deliberately not 5 and not 30.

Five minutes produces a character you never bonded with. Thirty is a wall people bounce off
before they know if they want this. Ten asks real investment without demanding a commitment
nobody has earned yet — and the investment is the point: **effort justification** means what
you worked for, you value more.

The System says so out loud at the start: *this will take about ten minutes, and it matters
that you answer honestly.* No progress-bar deception, no "just one more question."

**Design constraint:** the interview must reach a *complete, playable* character in ten
minutes. Broad across all domains rather than deep in any one — depth is what ongoing
induction is for. If it can't finish in ten, cut questions, don't extend.

**Ongoing induction is permanent.** One or two questions a day during the close-out ritual —
refining stats, unlocking domains, noticing drift. The character is revealed through play,
never fixed on day one.

**Privacy:** raw transcript held in memory for the session, used to produce the structured
Codex, then **discarded — never written to the database.** Stated boldly in-product: *we
derive your character from the interview and then delete the interview.*

---

## The Life Codex

A living document — the character's quest journal — that organizes the player's life and
stays current as they play. Usable *outside* the game: paste it into any LLM and that tool
instantly knows who you are and what you're working on.

**Source of truth is structured data in Postgres**, rendered to Markdown on demand. Never
store the Markdown as canonical — every surface stays consistent and re-rendering after a
schema change is free.

**Sections:** Identity · Current Situation · The Domains (state, goals, obstacles,
trajectory each) · Active Epics with milestone status · Habits with when/where · Constraints
and non-negotiables · History and records · Open questions the System is still working out.

**Updated on:** milestone completion, level-up, season boundary, micro-interview answer, and
any manual edit. Versioned, so the player can see how their life document changed over a
year — quietly one of the most compelling artifacts the product produces.

| Surface | Phase | Note |
|---|---|---|
| Markdown download / copy | 1 | Baseline. Doubles as GDPR export. |
| In-app journal view | 2 | Styled as System panels, not a document viewer. |
| Private token URL | 2 | Secret rotatable link serving live Markdown for LLM tools. |
| Google Drive auto-sync | 4 | Needs OAuth **and** Google app-verification review before it works beyond a handful of users. Real lift; last for a reason. |

---

## The honesty system

The product's soul. Without it this is a fantasy generator.

**The Oath.** Taken at Induction, in the player's own words, restated each season start:
*I will not claim what I have not done.*

**The Verification Screen** on milestones, level-ups and epic completions:

```
[VERIFICATION]
You are claiming: "Shipped the beta"
This grants: Level 12, +3 Wealth, [Founder's Signet]

The System cannot check this. Only you can.
What is the evidence?  ____________________

If you have not done this, claiming it is not an exploit.
It is the only way to actually lose.

  [ I HAVE DONE THIS ]        [ NOT YET ]
```

Choosing **NOT YET** is rewarded. That inversion makes honesty the path of least resistance
rather than a rule to obey.

**Integrity** is a real attribute. It rises from retracting claims, passing self-audits, and
choosing NOT YET. It is the only stat that cannot be raised by completing quests — and it
gates the highest-tier titles. Cheating to Level 50 with 2 Integrity produces a character
sheet that is visibly, permanently hollow.

**Seasonal self-audit.** At each season boundary the System presents the season's biggest
claims and asks the player to confirm or retract. Retracting *raises* Integrity and refunds
nothing — the honest ledger is worth more than the points.

**The Reality Check.** When metrics drift — logging a fitness daily for 40 days while the
Strength trajectory is flat — the System says so plainly and asks what's actually happening.

---

## Behavioral design

Hooked's loop (Trigger → Action → Variable Reward → Investment) pointed at real outcomes.

**The finding that shapes the design, stated accurately:** dopamine tracks *pursuit and
prediction error* — anticipation and surprise — not pleasure at the moment of reward. The
pull comes from visible proximity to a goal and from uncertainty, and the good feeling must
land on the **effort**, not on the tap that logs it. That is the entire difference between
this and a slot machine.

*Honesty note, since transparency is the thesis: "leveraging neurotransmitters" is a
metaphor. What's real is behavioral research. Overclaiming the neuroscience is exactly what
the transparency page should call out.*

Applied:

- **Fixed XP, variable loot.** A Hard quest is always 100 XP, known in advance — progress
  stays an honest mirror. Gold, items and rare drops roll on completion. Only the *garnish*
  is random.
- **Goal gradient** — always show proximity ("80% to Level 6"), never raw totals.
- **Implementation intentions** — quests capture **when and where**, not just what. The
  single highest real-world-impact UI decision in the product.
- **Peak-end rule** — the daily close-out ritual is the emotional high point and the last
  thing you see. It ends the session deliberately.
- **Fresh start effect** — 6–8 week **seasons** with clean slates, converting "I fell off
  forever" into "next season starts Monday."
- **Loss aversion** — decay only, used gently.
- **Tolerance guard** — reward magnitude is capped and does not escalate. Escalating rewards
  is how engagement products rot; seasons reset the baseline instead.
- **Self-Determination Theory guardrail** — extrinsic rewards can crowd out intrinsic
  motivation. Defense: the **Real-World Ledger** is the headline surface, above level and
  gold. "34 books. 180 sessions. 12kg." Levels are decoration on truth.

---

## Technical architecture

**Stack:** Next.js + TypeScript · Postgres via Supabase (auth + RLS) · Drizzle · Tailwind +
shadcn/ui (heavily reskinned) · Framer Motion · Claude API · Vercel · Resend · Sentry ·
PostHog · Playwright + Vitest.

**Two decisions that matter more than the rest:**

1. **Event-source the progression.** Never store `user.xp = 4500`. Append-only event log
   (`quest_completed`, `loot_rolled`, `claim_retracted`, `decay_applied`); derive everything.
   Buys economy rebalancing via replay, activity feed free, audit trail, trivial undo — and
   the audit trail is what makes the honesty system provable rather than decorative.
2. **Game rules are data, not code.** XP curves, item stats, loot tables, quest templates,
   achievements live in versioned config rows. Balance tweaks must not require a deploy.

**Security:**

- All game logic server-side. Client posts "completed quest X", never "give me 500 XP."
- RLS on every table — an API bug still can't leak another user's data.
- Managed auth provider, never hand-rolled.
- **Field-level encryption** for Codex content and all free text, per-user keys — a stolen
  dump is inert.
- LLM endpoints rate-limited hard and per-user; prompt-injection guard on any user text fed
  back into a prompt.
- Rate limiting on writes; secrets in platform vault; CI secret scanning; Dependabot;
  `/security-review` on every PR.
- Export and hard delete working from Phase 3.

**Assets (free):** game-icons.net (~4,000 RPG icons, CC BY) · Kenney.nl (CC0) · Habitica for
mechanics study only — copyleft, don't copy code.

---

## Phases

Each phase ends with something that works. Hours are the author's time, not Claude's.

| Phase | Deliverable | Effort |
|---|---|---|
| **0 — Feel test** | One page, fake data, XP bar, level-up animation, System voice. No login, no DB, no AI. Sole question: does the loop feel good and does the tone land? Disposable on purpose. | **4–6 h** |
| **1 — MVP** | Auth, DB, ~10-min Induction, seven attributes, four quest types, XP, levels, streaks, decay, Verification Screen, Integrity, Codex + Markdown export, daily close-out ritual. Installable on phone. Daily-usable. | **35–55 h** |
| **2 — Depth** | Gold, loot, items, equipment, shop, achievements, titles, seasons, seasonal audit, Reality Check, in-app Codex journal, private token URL, sound and animation polish, admin content tooling. | **35–55 h** |
| **3 — Safe for others** | Induction tuned against real drop-off data, privacy controls, transparency page, email, export/delete, error tracking, analytics, abuse handling, LLM cost controls. | **25–40 h** |
| **4 — Optional** | Google Drive sync, Health/Strava/GitHub verification, friends and parties, Phaser map scene. | open-ended |

**Phase 0 + 1 ≈ 40–60 h** is the number that matters — that's "I use this every day."

---

## Verification

- **Phase 0 is verified by feel.** Use it a week. If the loop is flat or the tone is wrong,
  redesign before Phase 1 — no infrastructure fixes a dead loop.
- Progression engine: real Vitest unit tests. Silent math bugs destroy trust in a way UI bugs
  don't. Explicit test that no AI code path can write to the XP ledger.
- Induction: run end-to-end against fake personas with very different lives. Confirm in each
  case that (a) the derived character is defensible, (b) it lands within ~10 minutes at
  realistic typing speed, (c) no transcript row ever reaches the database.
- Playwright end-to-end: sign up → Induction → create quest → complete → XP → level up →
  verification screen → Codex export.
- Manual each phase: install to phone home screen, confirm push arrives, confirm full
  log-a-quest round trip on mobile.
- Security: `/security-review` per PR, plus a deliberate attempt to read another user's data
  with a valid session before Phase 3 ships.

---

## Accounts and tools

| Tool | Role | Cost |
|---|---|---|
| GitHub ✓ | Code storage + version history; source Vercel deploys from | Free |
| Vercel | Hosting. Auto-builds every push; preview URL per change | Free → $20/mo |
| Supabase | Database + auth + Row Level Security | Free → $25/mo |
| Anthropic Console | **Claude API for in-app AI — separate from the Max plan** | Pay-per-use |
| Domain registrar | Web address | ~$12/yr |
| Sentry / PostHog / Resend | Errors / analytics / email — Phase 3 | Free tiers |

**No separate "backend tool."** Server code lives in the same Next.js project and runs on
Vercel. The only backend *choice* is the database, and it's Supabase.

### Build loop (no local install required)

Describe → Claude writes → push to GitHub → Vercel auto-builds → open the preview link on the
phone. No Node, no terminal, no local server. Total one-time learning: **~2–3 hours**
(accounts, git concepts, describing bugs precisely). No TypeScript/React/SQL/CSS ever.

### Android install

Two files (manifest + service worker) make it a PWA. Chrome on Android → ⋮ → Install app.
Home-screen icon, full-screen, offline, push notifications. **No Play Store, no APK, no $25
fee.** Updates are silent — push, and the next open is already new.

---

## Budget

### Two separate bills — do not conflate

**A. Claude Code building the app** — covered by the existing **Max 5x** plan.

> **Stay on 5x. Do not pre-upgrade to 20x.** Cadence is bursty and part-time; 5x fits that.
> Upgrade only after being cut off mid-session repeatedly across two or three sessions — not
> after a single warning. Check `/usage` for actual standing; limits shift over time, so
> don't plan against remembered numbers.

Stretching the plan alongside other commitments:

- Plan-mode discussion is cheap; code generation is expensive. Think before building.
- Dedicated blocks — don't interleave this with unrelated work in one session.
- `CLAUDE.md` re-orients in a few hundred words instead of re-reading the project.
- Small vertical slices; avoid whole-phase megasessions.

**B. Claude API inside the game** — **not covered by Max.** Separate console account and
card. Induction is the expensive call (cents per person); micro-interviews and Codex updates
are negligible. Solo: pennies/month. At a thousand users it's a real line item.

> **Day one, before any AI code: set a hard spend limit in the Anthropic Console.** A runaway
> loop or a hammered interview endpoint is the only way this bill surprises anyone.

| Stage | Monthly |
|---|---|
| Phases 0–1 (solo) | **$0** + $12/yr domain |
| Phases 2–3 (few testers) | **$0** — still free tiers |
| Real users (hundreds) | **~$45** + API usage |

No app store, engine, or license fees, ever.

---

## Open risks

Two things are genuinely unresolved — not blockers, but where this could go wrong:

1. **The Verification Screen is untested psychology.** The theory is that making honesty the
   low-friction path beats policing. It might instead read as nagging. Phase 0 is where to
   find out — put a fake one in the spike and see how it lands.
2. **Ten minutes of interview producing a character that feels *right* is the hardest single
   thing in Phase 1.** If the derived stats feel arbitrary, the whole covenant reads as
   theater. Expect to iterate hardest here.

---

## Cold-start protection

Cadence is "whenever I feel like it," so gaps are planned for:

- `CLAUDE.md` will hold the domain model, the covenant, the tone spec, and the AI boundary —
  the highest-leverage file in the repo.
- A running decisions log, so returning after three weeks isn't a re-derivation.
- Phases sized so no stretch leaves the app broken.
