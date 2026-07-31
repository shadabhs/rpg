# The System — Design Decisions & Build Roadmap

> Status: **Phase 0 built and pushed.** This is the decision record — canonical for all
> product decisions.

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
| **Character** | Six life domains + Integrity | **Vitality** (body), **Mind** (inner life), **Craft** (work/means), **Bonds** (relationships), **Spirit** (meaning), **Virtue** (character) — plus **Integrity**, earned only through honesty with the System. See "The life model". |
| **Content types** | All four, plus vices | Daily habits · epics with milestones · work/project tasks · **Measures** (quantities with ciphers and per-measure privacy) · **vices** (abstinence, separate mechanic). Last two ship Phase 2. |
| **Social** | Solo now, architected for later | Private today; `visibility` flags and user-scoped schema from day one. |
| **Aesthetic** | Dark fantasy "System" (Solo Leveling) | Blue holographic panels, terminal notifications — `[QUEST COMPLETE]`, `[LEVEL UP]`. A system that plainly states what it is doing. Cheapest path to looking genuinely great (typography + glow, not illustration). |
| **Avatar** | Anime-style, serious. Selectable, **purely cosmetic**. 5 tiers per character. | Starts plain and becomes impressive only through earned progress — so it doesn't lie, it *is* the covenant made visible. Cosmetic-only because a class perk is power granted for free, and because nobody can know at Induction which life they'll actually live. |
| **Home screen** | Status Window (character sheet) | Most striking opening and the reason to open it daily; Real-World Ledger one scroll down keeps reality present. |
| **Sound / haptics** | On by default, one-tap mute | Where game feel lives; nobody discovers audio that ships muted. Mute control persistent and obvious. |
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
| "Welcome back! We missed you!" | `[STATUS] 9 days absent. Vitality has rusted 6%. Nothing else was lost.` |
| "Keep going, you've got this!" | `[EPIC] 4 of 7 milestones. The next one is the hard one.` |
| "You've unlocked a badge!" | `[TITLE] The Unbroken. 90 days without a missed daily. Your previous best was 23.` |
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

## The life model

### Hierarchy

**Domain → Facet → Epic → Milestone → Habit/Quest**

> **BONDS** → **Family** → *"Repair my relationship with my father"* → *"Call every Sunday
> for three months"* → *"Sunday 7pm, from home, phone call"*

The epic/milestone split is load-bearing. Without milestones, year-long goals sit inert
giving no feedback, which is how they die.

### The six domains

**Hard rule: six domains, maximum.** D&D has six; nearly every RPG lands near six. That's
the limit of what a person can hold in their head and care about. Richness lives at the
*facet* level, never by adding more bars.

| Domain | Covers | Facets |
|---|---|---|
| **VITALITY** | The body | Fitness · Sleep · Nutrition · Medical · Recovery |
| **MIND** | The inner life | Mental health · Learning · Focus · Emotional regulation |
| **CRAFT** | Work and means | Career · Skill · Finances · Output |
| **BONDS** | Everyone else | Family · Partner · Friends · Community |
| **SPIRIT** | Meaning | Purpose · Faith/practice · Reflection · Gratitude |
| **VIRTUE** | Character | Charity · Service · Honesty in dealings · Keeping your word |
| *INTEGRITY* | *Meta* | *Not interviewed. Earned only through honesty with the System.* |

Revised from an earlier draft: **Discipline** was dropped (it's a *means*, not a life area —
it surfaces as streaks and consistency, not a bar), **Charisma** became **Bonds** (the goal
is a real relationship with your father, not being charming), **Wealth** folded into
**Craft**, and **Virtue** was added to cover charity and ethics.

> **Virtue is how you treat other people. Integrity is how you treat the truth.**

### Vices — a separate mechanic, not a quest

**Ships in Phase 2**, so the positive loop is proven first. But Induction *asks* about vices
in Phase 1 and records them in the Codex — the data exists from day one; only the tracking
mechanic waits. Otherwise the Codex carries a hole for months and needs a re-interview later.

A quest asks *did I do it?* A vice asks *how long since?* Completions vs elapsed time —
different data shape, different psychology.

**The trap to avoid: penalising relapse.** Penalty creates shame, shame creates concealment,
and concealment destroys the honesty system — the most important thing in the product. A
user who relapsed *and* hid it is strictly worse off than before they started.

**So: relapse costs nothing. Reporting it is rewarded.**

```
[RECORDED] Streak reset. Previous: 34 days.
That is 34 days you did not have before.
Total clean days: 187.
Next attempt begins now.
```

1. **Cumulative clean days never reset** — a permanent, monotonically increasing number. The
   anti-shame engine: most streak systems erase your history, this one banks it.
2. **Honest relapse logging grants Integrity** — one of the strongest Integrity moves.
3. **Every vice requires a declared replacement** — "when I want to X, I will Y."
   Implementation intentions again; removing a behaviour without replacing its function fails.

Vices feed domains normally (quitting smoking → Vitality; managing anger → Bonds).

**Responsibility:** for genuinely dangerous dependencies — alcohol, drugs, self-harm, eating
disorders — the app must not position itself as treatment. Quiet, non-preachy signposting to
real help; no gamification of the medical part.

### Measures — encoding real quantities (Phase 2)

Some facets are governed by a *quantity*, not a checkbox: bank balance, bodyweight,
books, revenue. These are **Measures**, and they follow one rule above all others:

> **Encode the delta. Display the stock. Only the delta grants anything.**

A stock is a reading, never an achievement. If ₹10 lakh became 10,000 coins that
bought equipment granting stats, someone who *inherited* money would be more powerful
than someone who worked — pay-to-win where the payment happened outside the app. It
also breaks "Level 1 must feel weak", since a wealthy player would open the app rich.

**Contributions earn XP. Valuations do not.** If the market rises 8% you did nothing.
Awarding XP for that reinvents passive gains, which the covenant forbids. So every
financial Measure carries two numbers: its **value** (a reading, grants nothing) and
its **contribution** (what you actually moved, which earns Craft XP).

#### Anatomy of a Measure

| Property | Example |
|---|---|
| Real unit | ₹ · kg · hours · books |
| Game unit + **cipher** | 1 Sovereign = ₹100 (ratio chosen by the player) |
| Scale | tiered (vaults) · linear · logarithmic |
| Privacy | **per measure**: visible · masked · PIN/biometric-gated |
| XP source | **change only, never level** |
| Staleness | `Last calibrated 47 days ago` |

**The cipher is a privacy feature, not flavour.** A screen reading `₹10,00,000` is real
exposure to anyone glancing at the phone; `10,000 Sovereigns` is precise to the player
and meaningless to everyone else. Game units display by default; tap-and-hold reveals
the real figure, optionally behind device PIN or biometric.

**Staleness is stated plainly.** A Measure nobody has updated is a lie by omission. The
System shows when it was last calibrated rather than presenting a confident stale number.

#### Display: proximity, not totals

Linear encoding breaks at the edges — ₹100 = 1 coin means a crore shows as 100,000 coins
next to someone's 200. Use the existing invariant instead: **always show proximity**.

```
[TREASURY]  SILVER VAULT
            ████████░░  68% to GOLD VAULT
            Runway: 7.2 months
```

Tiered vaults (Copper → Silver → Gold → Platinum → Mythril), each a multiple of the last.
A student going ₹20k → ₹50k crosses a tier exactly as a ₹20L → ₹50L move does.

#### The Craft finance measures

Tracked **separately**, never as one composite:

| Measure | Earns XP on |
|---|---|
| **Liquid** — cash and bank | net contribution |
| **Assets** — property, investments | contribution only, never appreciation |
| **Liabilities** — debt | principal repaid |
| **Monthly income** | verified increase, as a milestone — not monthly salary arriving |

Receiving a salary is not an achievement; the work that earned it is already a Craft quest.

**Derived readouts** are computed only where their inputs exist, and are never required:

```
NET WORTH     assets + liquid − liabilities
RUNWAY        liquid ÷ monthly burn
SAVINGS RATE  (income − burn) ÷ income
```

Runway is the preferred headline once burn is tracked — it normalises across every income
level and moves when spending is cut, not only when earnings rise.

> **Privacy inheritance:** a derived readout takes the **strictest** privacy of its inputs
> and cannot be loosened. Otherwise an ungated Runway leaks a PIN-gated Liquid to anyone
> who knows the burn rate. The same rule binds notifications and the Codex export — a
> masked Measure never appears in plaintext in either.

Wealth is where lying is most tempting, so large jumps in a Measure trigger the same
**Verification Screen** as a milestone. Phase 4 optionally connects read-only bank or
brokerage access, turning a self-reported number into a verified one.

#### Where it lives

**Not in Settings** — settings is where features go to die. A dedicated in-world
**`[CALIBRATION]`** screen, reached from the Codex and from any domain, holds measures,
units, ciphers, targets and privacy. Settings keeps only mechanical preferences: sound,
notifications, theme, account.

**Induction proposes it.** The interview asks whether to track finances, in what units,
and what should stay hidden — then builds it and shows the player what it made. Discovery
by configuration is how personalisation features go unused.

**Phasing:** Induction captures Measures in Phase 1 so the data exists from day one; the
Calibration UI, ciphers and vault tiers ship in Phase 2 — same pattern as vices.

### Four non-obvious rules

1. **Not everything should be scored.** Grief, illness, a brutal work season should be
   *acknowledged*, not gamified. A declarable **Season of Endurance** pauses decay and stops
   the System asking for more. The difference between an app that survives your worst year
   and one you delete during it.
2. **A balanced character is not the goal.** Radar charts create pressure to round out, but a
   great life is often deliberately lopsided — someone building a company *should* have low
   Bonds for two years, by choice. Players **declare a seasonal focus**; the System then stops
   nagging about consciously deprioritised domains.
3. **Bonds quests are about your actions, never outcomes.** You can call your father weekly;
   you cannot make him warm. Scoring relationship *quality* punishes you for other people's
   behaviour.
4. **Charity cannot scale with money.** XP proportional to amount lets wealthy players buy
   Virtue. Reward consistency and proportion, never volume.

---

## Look and feel

### Design brief: where "sense of purpose" actually comes from

Reference points are Kingdom Come: Deliverance, RDR2, GTA V — single-player RPGs that
generate real purpose about fictional lives. Five portable mechanisms, none of them
graphical:

1. **You are somebody specific, mid-situation.** Arthur is dying; Henry's village burned.
   Never a blank slate. → Induction ends with the System stating your actual situation back
   to you, coldly and with weight. Not "Welcome!"
2. **Things stick.** Irreversible choices are why they matter. → The append-only event log
   *is* this mechanic. History can be added to, never edited.
3. **You start genuinely incompetent.** KCD won't let you fight or read at first; learning
   to read is a quest. → Starting attributes are honestly low. **Level 1 must feel weak.**
   A character that starts strong has nowhere to go.
4. **The interface is the world.** No HUD bolted on top. → There is no "Settings" screen;
   there is `[SYSTEM CONFIGURATION]`.
5. **Ritual and pacing.** Camp, cook, sleep-to-save. Ceremony makes meaning. → The daily
   close-out ritual.

> RDR2 gives you a sense of purpose about a life you're not living.
> This gives you the same feeling about the one you are.

### The avatar

Anime-styled, **serious** — no chibi, no cute. Selected at Induction, **purely cosmetic**:
it changes nothing mechanically. Everyone earns on identical terms, characters can be added
forever without rebalancing, and no one can pick "wrong" for a life they haven't lived yet.

**The governing rule: the avatar may never depict something you haven't earned.** It starts
*unremarkable* — not ugly, just plain — and becomes impressive only through real achievement.
That makes it the most honest surface in the app rather than the least: its coolness is a
direct readout of what you actually did. It works downward too — during decay the figure
visibly dulls.

It is an **emblem, not a portrait** — the way a D&D character is. This sidesteps "it doesn't
look like me" entirely.

**Tiers, not layers.** Layered equipment sprites (base body + armor + weapon, pixel-aligned)
are how indie RPGs die: characters × slots × items explodes into hundreds of assets that must
all line up. Instead, each character has **~5 full illustrations**, one per tier. Crossing a
threshold *transforms* the portrait. ~8 characters × 5 tiers ≈ 40 images, each individually
beautiful, zero alignment problems — and a transformation is a far bigger emotional beat than
swapping a helmet sprite.

**Tier gating:**

| Tier | Requirement |
|---|---|
| I–IV | Overall level thresholds |
| **V — final form** | Level threshold **plus high Integrity** |

Tier V is the honesty system made permanently visible. A player who fabricated their way to
Level 50 hits a ceiling they can never pass — and the System never accuses them of anything.
It states the requirement and nothing more: `[TIER V] Requires Integrity 80. Current: 12.`

**The live effects layer** sits on top of the tier illustration and responds to current state
in real time. CSS and shaders, not artwork — free, and never needs new assets:

- **Aura colour** = dominant domain (Vitality burns red, Mind cold blue). This is why tiers
  don't need per-domain variants — expression is handled here, at no art cost.
- **Glow intensity** = recent consistency. Bright when steady, dim when drifting.
- **Desaturation** = decay creeping in.
- **Particles** on the highest tiers only.

Art updates five times across the whole journey; the character looks alive every day.

**Equipment** stays in the panel as icons and stat modifiers. Never worn on the body.

**Lift:** ~40 illustrations in a *consistent* style is the hard part — cross-image consistency
is where AI generation usually fails. Budget 8–15 h of iteration, or ~$50–150 per character
commissioned. **Phase 2, not Phase 0.** Deferring is free: an avatar is just an image
reference per (character, tier), so the tier-swap logic is identical whether the portrait is
a masterpiece or a grey shape. Phase 0 tests the transformation *feel* with a placeholder
silhouette — if the tier-up moment doesn't land as a grey shape, expensive art won't save it.

### Palette

- **Base:** near-black with a blue-violet cast (~`#05070D`). Never pure black — reads cheap.
- **System signature:** cyan-blue (`#4DA6FF` → `#7FD4FF`), used sparingly enough to retain
  meaning.
- **Rarity ladder:** grey → green → blue → purple → gold. Twenty years of RPG convention
  means value is read before the name is. Never rely on colour alone — pair with an icon
  frame or label.
- **Decay:** desaturated rust, never alarm-red. The System does not panic.
- **Integrity:** a pale clean gold, visually distinct from every other stat.

### Typography

Technical/mono face for System notifications (the terminal feel). Weighted, slightly
condensed headers. Highly readable sans for body. **Tabular figures everywhere numbers
change**, so counting animations don't jitter.

### Motion — where "stunning" actually comes from

Timing, not artwork. One gesture language used everywhere makes it read as a system rather
than a website.

- **Panels resolve, they don't appear.** A scan line sweeps down, the panel materializes
  behind it. ~300ms. Every window in the app.
- **Numbers never jump.** XP counts up with easing. Highest value-per-effort animation in
  the product.
- **Bars overshoot and settle**, with a leading edge of light.
- **Level-up holds a beat of silence first.** Screen dims, everything stops, *then* the
  number changes. The pause before the payoff is the payoff.
- **Easing is sharp and decisive.** Never bouncy — bounce reads as toy.

### Sound and haptics — on by default, one-tap mute

Five sounds: panel open, quest complete, XP tick, level-up, verification. This is what
separates a game from a website and it is chronically underrated. `navigator.vibrate()` on
Android for completion and level-up — makes a PWA feel native in a way no visual can.

Default on, because most users never discover audio that ships muted. The mute control is
persistent and obvious, per the transparency stance.

### Anti-cheap rules

No instant state changes without transition · no default system fonts · no flat colour
without depth · no bouncy easing · no emoji as icons · no uniform sizing (nothing has
hierarchy without contrast).

### The honest constraint

RDR2 had hundreds of artists; that asset quality is unreachable and chasing it kills the
project. But asset budget is not what makes those games feel expensive — **restraint,
consistency, timing, sound and typography are, and all five are free.** A tightly-timed,
visually consistent interface built from free icons beats a badly-timed one with custom art.
Compete on craft.

### Screens

| Screen | Role |
|---|---|
| **Status Window** (home) | Avatar at current tier with live aura, level, attributes, title, active quests. The money shot. Real-World Ledger one scroll down: reality always present, game greets you first. |
| **Today** | Quest list. Thumb-reachable, one tap to complete, under 5 seconds. |
| **Quest Log** | Epics with milestone trees. |
| **Codex** | The life journal, styled as System panels. |
| **Close-out** | The daily ritual. Peak-end moment; last thing seen. |
| **Verification** | Full-screen, weighty, unhurried. |

### Accessibility

Respect `prefers-reduced-motion` — replace scan-ins and counters with instant states.
Rarity and status never encoded in colour alone. Contrast checked against the near-black
base; glow is decoration, never the only signal.

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
3. **Domain sweep** — each of the **six life domains** probed (Vitality, Mind, Craft, Bonds,
   Spirit, Virtue): current state, what you've tried, what stopped you. Adaptive: follows the
   thread where there's energy or pain. Also captures vices, recorded in the Codex even
   though vice *tracking* ships in Phase 2. **Integrity is never probed** — see below.
4. **Aspiration** — what you actually want, on 1-year and 5-year horizons.
5. **Constraints** — time, money, health, obligations. What can't change.
6. **Decomposition** — the System proposes epics, milestones and starting dailies, each with
   a **when and where**. The player edits and confirms. Nothing is imposed.
7. **Manifestation** — the six domain attributes derived from the interview, not chosen.
   Cosmetics *are* chosen. The System states plainly why each stat landed where it did.

**Seven attributes, six of them interviewed.** Integrity is the exception: it cannot be
self-reported, because a stat measuring honesty that you set yourself is worthless. It
starts at a neutral baseline for everyone and moves only through demonstrated behaviour.

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

**Sections:** Identity · Current Situation · The Six Domains (state, goals, obstacles,
trajectory each) · Active Epics with milestone status · Habits with when/where · Vices and
clean-day records · Constraints and non-negotiables · History and records · Open questions
the System is still working out.

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
This grants: Level 12, +3 Craft, [Founder's Signet]

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
gates the highest-tier titles and Tier V of the avatar. Cheating to Level 50 with 2 Integrity
produces a character sheet that is visibly, permanently hollow.

**Integrity starts at a neutral baseline and only ever rises. It never falls.** This follows
directly from the tone rule *never accuse*: the System cannot detect a lie, so it must never
punish a suspected one. It can only reward honesty it has actually witnessed. Low Integrity
is therefore an absence of evidence, never an accusation — and the System says so when asked.

**Seasonal self-audit.** At each season boundary the System presents the season's biggest
claims and asks the player to confirm or retract. Retracting *raises* Integrity and refunds
nothing — the honest ledger is worth more than the points.

**The Reality Check.** When metrics drift — logging a fitness daily for 40 days while the
Vitality trajectory is flat — the System says so plainly and asks what's actually happening.

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

**Two decisions that matter more than the rest** — and the only two that are genuinely hard
to change later:

1. **Event-source the progression.** Never store `user.xp = 4500`. Append-only event log
   (`quest_completed`, `loot_rolled`, `claim_retracted`, `decay_applied`); derive everything.
   Buys economy rebalancing via replay, activity feed free, audit trail, trivial undo — and
   the audit trail is what makes the honesty system provable rather than decorative.
2. **Game rules are data, not code.** XP curves, item stats, loot tables, quest templates,
   achievements live in versioned config rows. Balance tweaks must not require a deploy.

Everything else is designed to be changed cheaply: avatars are image references, rules are
rows, and Phase 0 is disposable by intent.

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
- Data export lands in Phase 1 (the Codex Markdown export doubles as it). Hard delete —
  full account and data erasure — lands in Phase 3, before anyone but the author signs up.

**Assets (free):** game-icons.net (~4,000 RPG icons, CC BY) · Kenney.nl (CC0) · Habitica for
mechanics study only — copyleft, don't copy code.

---

## Phases

Each phase ends with something that works. Hours are the author's time, not Claude's.

| Phase | Deliverable | Effort |
|---|---|---|
| **0 — Feel test** ✅ | Status Window with fake data, placeholder silhouette avatar + tier-up transformation, panel scan-in, counting XP, bar overshoot, level-up hold, synthesized sound + haptics, Verification Screen. No login, no DB, no AI, no real art. **Built.** Now awaiting the only verdict that matters: does it feel good and does the tone land? Disposable on purpose. | **done** |
| **1 — MVP** | Auth, DB, ~10-min Induction, seven attributes, four quest types, XP, levels, streaks, decay, Verification Screen, Integrity, Codex + Markdown export, daily close-out ritual. Installable on phone. Daily-usable. | **35–55 h** |
| **2 — Depth** | **Measures + `[CALIBRATION]`** (ciphers, per-measure privacy, vault tiers, derived readouts), **Vices** (clean streaks, cumulative clean days, no-penalty relapse logging, declared replacements), character roster + ~40 tier illustrations, live aura layer, gold, loot, items, equipment, shop, achievements, titles, seasons + seasonal focus + Season of Endurance, seasonal audit, Reality Check, in-app Codex journal, private token URL, sound and animation polish, admin content tooling. | **62–92 h** |
| **3 — Safe for others** | Induction tuned against real drop-off data, privacy controls, transparency page, email, export/delete, error tracking, analytics, abuse handling, LLM cost controls. | **25–40 h** |
| **4 — Optional** | Google Drive sync, Health/Strava/GitHub verification, read-only bank/brokerage connection for verified Measures, friends and parties, Phaser map scene. | open-ended |

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

### Build order

Code first, accounts only when something needs them, domain last.

1. **Phase 0 built** — zero accounts required.
2. **Vercel signup** (~10 min) — the only thing needed to see and feel it on a phone.
3. **Live with it a week** — the real gate.
4. **Supabase** (~20 min) — only once things must persist.
5. **Anthropic Console** — when Induction is built. Set the spend limit *first*.
6. **Domain** — whenever. Purely cosmetic; `*.vercel.app` works fine for months.

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

## Open items

None block Phase 0. Each is decidable when its phase arrives:

| Item | Needed by |
|---|---|
| XP curve and level thresholds (actual numbers) | Phase 1 |
| Launch character roster size | Phase 2 |
| Tier thresholds, and the Integrity bar for Tier V | Phase 2 |
| Starting vice list and facet taxonomy refinement | Phase 2 |
| Vault tier multiplier, and default Measure set per domain | Phase 2 |
| Whether the Codex can be shared with chosen people, or stays strictly private | Phase 2/3 |

## Open risks

1. **The Verification Screen is untested psychology.** The theory is that making honesty the
   low-friction path beats policing. It might instead read as nagging. Phase 0 is where to
   find out — put a fake one in the spike and see how it lands.
2. **Ten minutes of interview producing a character that feels *right* is the hardest single
   thing in Phase 1.** If the derived stats feel arbitrary, the whole covenant reads as
   theater. Expect to iterate hardest here.
3. **"Level 1 must feel weak" will be hard to hold.** Every instinct pushes toward a generous
   first session, and that's exactly what drains the next fifty of meaning.

---

## Cold-start protection

Cadence is "whenever I feel like it," so gaps are planned for:

- `AGENTS.md` (loaded via `CLAUDE.md`) holds the domain model, the covenant, the tone spec,
  the AI boundary and the design invariants — the highest-leverage file in the repo.
- A running decisions log, so returning after three weeks isn't a re-derivation.
- Phases sized so no stretch leaves the app broken.
