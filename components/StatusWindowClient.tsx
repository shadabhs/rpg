"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/Panel";
import { Avatar } from "@/components/Avatar";
import { StatBar } from "@/components/StatBar";
import { CountUp } from "@/components/CountUp";
import { VerificationScreen } from "@/components/VerificationScreen";
import { LevelUpOverlay } from "@/components/LevelUpOverlay";
import { TierUpOverlay } from "@/components/TierUpOverlay";
import { RecordOverlay } from "@/components/RecordOverlay";
import { initAudio, play } from "@/lib/sound";
import { useTzOffsetMinutes } from "@/lib/hooks";
import { buzz } from "@/lib/haptics";
import { reduce } from "@/lib/engine/reducer";
import { evaluateRequisites } from "@/lib/engine/requisites";
import type { SystemEvent } from "@/lib/engine/events";
import { DOMAIN_KEYS, DOMAIN_DISPLAY, type DomainKey } from "@/lib/engine/domains";
import {
  XP_BY_DIFFICULTY,
  TIER_NAMES,
  MODULE_UNLOCK_LEVELS,
  MATERIAL_LORE,
  type Difficulty,
} from "@/lib/engine/rules";
import type { QuestRow, EpicRow } from "@/db/mappers";
import { EpicsPanel } from "@/components/EpicsPanel";
import { ChroniclePanel } from "@/components/ChroniclePanel";
import { TitlesPanel } from "@/components/TitlesPanel";
import { FirstRunRite } from "@/components/FirstRunRite";
import { SystemPanel } from "@/components/SystemPanel";
import { SystemNav, type View } from "@/components/SystemNav";
import {
  chronicleEntries,
  buildLedger,
  buildDayReport,
  buildWeekReport,
  buildPossessions,
} from "@/lib/engine/chronicle";
import { MATERIAL_NAMES, type Requisite } from "@/lib/engine/requisites";
import { ITEM_LORE } from "@/lib/engine/rules";
import { useActions } from "@/components/ActionsContext";

type Toast = { id: number; text: string; color: string };

const ROMAN = ["I", "II", "III", "IV", "V"];
const DIFFICULTIES: Difficulty[] = ["TRIVIAL", "STANDARD", "HARD", "SEVERE"];

export function StatusWindowClient({
  characterName,
  title,
  initialEvents,
  initialQuests,
  initialEpics,
}: {
  characterName: string;
  title: string;
  initialEvents: SystemEvent[];
  initialQuests: QuestRow[];
  initialEpics: EpicRow[];
}) {
  const [events, setEvents] = useState<SystemEvent[]>(initialEvents);
  const [quests, setQuests] = useState<QuestRow[]>(initialQuests);
  const [epics, setEpics] = useState<EpicRow[]>(initialEpics);
  const [wornTitle, setWornTitle] = useState(title);
  const [charName, setCharName] = useState(characterName);
  // The rite runs once: a still-default name and an empty log means the
  // System genuinely has no record of this person yet.
  const [riteOpen, setRiteOpen] = useState(
    characterName === "SUBJECT" && initialEvents.length === 0,
  );
  const tz = useTzOffsetMinutes();
  const router = useRouter();
  const actions = useActions();
  const { completeQuest, undoCompletion, verifyClaim, declineClaim, removeQuest } =
    actions;
  /** Re-pull server truth. The live QA pass found a state where the UI and
   *  the database disagreed and NOTHING would reconcile them short of a
   *  manual reload — the client never refetched. Now every successful
   *  mutation triggers a refresh, and the adoption effect below folds the
   *  fresh rows in. (The preview harness overrides this with a no-op: its
   *  "server" is in-memory client state.) */
  const resync = actions.resync ?? (() => router.refresh());

  const [verifying, setVerifying] = useState<QuestRow | null>(null);
  const [levelUp, setLevelUp] = useState<{ from: number; to: number } | null>(null);
  const [tierUp, setTierUp] = useState<{ from: number; to: number } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newQuestOpen, setNewQuestOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [record, setRecord] = useState<{
    quest: string;
    streak: number;
    previous: number;
  } | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  /** Which System module is open. Client-side rather than routed: one
   *  fetch and one reduce() feed every view, so switching is instant and
   *  the character can never differ between screens. */
  const [view, setView] = useState<View>("today");

  const [seconds, setSeconds] = useState(0);
  const toastId = useRef(0);
  const optimisticId = useRef(0);
  const prevTier = useRef<number | null>(null);
  /** Mirrors `busy` for the adoption effect below — a ref, because making
   *  the effect depend on `busy` would re-adopt STALE props the moment an
   *  action finishes, wiping its own optimistic event before the refresh
   *  lands. */
  const busyRef = useRef<string | null>(null);
  function markBusy(v: string | null) {
    busyRef.current = v;
    setBusy(v);
  }
  function nextOptimisticId() {
    optimisticId.current += 1;
    return `optimistic-${optimisticId.current}`;
  }

  /**
   * Server Action calls can THROW (network failure, deploy mid-flight),
   * not just return { ok: false }. An uncaught throw between markBusy(id)
   * and markBusy(null) would strand `busy` forever — after which every
   * tap silently returns early and the whole app reads as dead. Every
   * awaited action goes through here: a throw becomes an ordinary
   * rejection, and busy ALWAYS clears.
   */
  async function safeCall<T extends { ok: boolean }>(
    busyId: string | null,
    call: () => Promise<T>,
  ): Promise<T | { ok: false; error: string }> {
    if (busyId !== null) markBusy(busyId);
    try {
      return await call();
    } catch {
      return {
        ok: false,
        error: "The System could not be reached. Nothing was recorded.",
      };
    } finally {
      if (busyId !== null) markBusy(null);
    }
  }

  // Adopt server truth whenever router.refresh() delivers fresh rows and
  // no action is in flight. This is what makes any client/server drift
  // self-healing instead of permanent: the QA pass proved a desync could
  // otherwise survive until the player happened to reload.
  useEffect(() => {
    if (busyRef.current !== null) return;
    setEvents(initialEvents);
    setQuests(initialQuests);
    setEpics(initialEpics);
  }, [initialEvents, initialQuests, initialEpics]);

  useEffect(() => {
    const i = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, []);

  // The single source of truth for level/XP/Integrity/domains/tier. Same
  // pure function the server uses to persist truth — running it here too
  // is what makes the optimistic update exact rather than approximate.
  const state = useMemo(() => reduce(events, new Date(), tz), [events, tz]);

  // A module the character doesn't qualify for (a reset drops the level)
  // renders as TODAY instead — derived at render, no effect needed.
  const activeView =
    state.level < MODULE_UNLOCK_LEVELS[view] ? ("today" as View) : view;

  const questTitleById = useMemo(
    () => Object.fromEntries(quests.map((q) => [q.id, q.title])),
    [quests],
  );
  const chronicle = useMemo(
    () => chronicleEntries(events, questTitleById, tz),
    [events, questTitleById, tz],
  );
  const ledger = useMemo(() => buildLedger(events, tz), [events, tz]);
  const possessions = useMemo(() => buildPossessions(events), [events]);
  const dayReport = useMemo(
    () => buildDayReport(events, new Date(), tz),
    [events, tz],
  );
  const weekReport = useMemo(
    () => buildWeekReport(events, new Date(), tz),
    [events, tz],
  );

  const domains = DOMAIN_KEYS.map((key) => ({
    key,
    ...DOMAIN_DISPLAY[key],
    value: state.domains[key],
  }));

  const dominant = useMemo(
    () => domains.reduce((a, b) => (b.value > a.value ? b : a)),
    [domains],
  );

  /** Outstanding right now: a once-quest still active, or a daily not yet
   *  done today. This is what "remaining" and the close-out both key off. */
  const isOutstanding = (q: QuestRow) =>
    q.cadence === "daily"
      ? !state.questStats[q.id]?.doneToday
      : q.status === "active";

  const epicOf = (q: QuestRow) =>
    q.epic_id ? (epics.find((e) => e.id === q.epic_id) ?? null) : null;

  /** Preparation on file for a milestone. Never gates the claim itself —
   *  it only changes what the Verification Screen says. */
  const requisitesFor = (q: QuestRow) =>
    evaluateRequisites(q.requisites, state, events);

  /** TODAY holds the tap-to-complete work. Milestones are claims against
   *  a campaign, not chores — mixing them into the same list made a
   *  solemn Verification Screen look like another checkbox. */
  const dailyQuests = quests.filter((q) => !q.weighty);
  const milestoneQuests = quests.filter((q) => q.weighty);

  const outstanding = dailyQuests.filter(isOutstanding);
  const hasAnyQuests = dailyQuests.length > 0;
  const dayClosed = hasAnyQuests && outstanding.length === 0;
  const xpPct = Math.min(100, (state.xpIntoLevel / state.xpForNextLevel) * 100);

  // Fire the tier overlay whenever the derived tier actually rises —
  // never a button, always a consequence of what reduce() computed.
  useEffect(() => {
    if (prevTier.current !== null && state.tier > prevTier.current) {
      setTierUp({ from: prevTier.current, to: state.tier });
    }
    prevTier.current = state.tier;
  }, [state.tier]);

  function toast(text: string, color: string, durationMs = 1100) {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, color }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), durationMs);
  }

  /** A server rejection reverts optimistic state — the player must SEE
   *  that, or the revert reads as data loss on the next reload. Long
   *  toast, and the same message pinned as a fault line under the header
   *  until the next successful action. */
  function rejected(error: string) {
    setFault(error);
    toast(`[ REJECTED ] ${error}`, "var(--color-rust)", 5000);
  }

  function optimisticAppend(event: SystemEvent) {
    setFault(null); // a fresh attempt clears the pinned fault line
    const now = new Date();
    const before = reduce(events, now, tz);
    const nextEvents = [...events, event];
    const after = reduce(nextEvents, now, tz);
    setEvents(nextEvents);
    return { before, after };
  }

  function revert(eventId: string) {
    setEvents((evts) => evts.filter((e) => e.id !== eventId));
  }

  async function handleQuestTap(quest: QuestRow) {
    if (busy) return;
    const isDaily = quest.cadence === "daily";
    // A daily never leaves 'active'; "done today" is what gates it. Say
    // so — the QA pass found the silent no-op read as "the app ignored
    // me", which is worse than a refusal.
    if (isDaily ? state.questStats[quest.id]?.doneToday : quest.status !== "active") {
      // System cyan, not ink-faint: the live QA pass proved a #3d4a60
      // toast on the #05070D background is invisible to the eye (and to
      // screenshots) while still passing DOM-text assertions. A refusal
      // must be READABLE, not merely rendered.
      toast(
        isDaily ? "Already done today." : "Already resolved.",
        "var(--color-sys)",
        2200,
      );
      return;
    }
    initAudio();

    if (quest.weighty) {
      setVerifying(quest);
      return;
    }

    const optimisticId = nextOptimisticId();
    if (!isDaily) {
      setQuests((qs) =>
        qs.map((q) => (q.id === quest.id ? { ...q, status: "completed" } : q)),
      );
    }
    const { before, after } = optimisticAppend({
      type: "quest_completed",
      id: optimisticId,
      timestamp: new Date().toISOString(),
      domain: quest.domain,
      difficulty: quest.difficulty,
      questId: quest.id,
    });

    // Report XP actually BANKED, not the quest's nominal value. At the
    // weekly ceiling a completion banks nothing, and the close-out panel
    // already says "0 XP banked" — a toast claiming "+250 XP" would be a
    // confidently wrong number contradicted by the same screen.
    const gain = after.totalXp - before.totalXp;
    toast(
      gain > 0 ? `+${gain} XP` : "[ CAPPED ] Weekly ceiling reached. 0 XP.",
      gain > 0 ? DOMAIN_DISPLAY[quest.domain].color : "var(--color-rust)",
      gain > 0 ? 1100 : 2600,
    );

    // The System reports reality, it never congratulates. A record line
    // states the fact and the number it beat — nothing more.
    const wasBest = before.questStats[quest.id]?.bestStreak ?? 0;
    const nowStreak = after.questStats[quest.id]?.streak ?? 0;
    if (isDaily && nowStreak > wasBest && nowStreak > 1) {
      setRecord({ quest: quest.title, streak: nowStreak, previous: wasBest });
    }

    if (after.level > before.level) {
      setTimeout(() => setLevelUp({ from: before.level, to: after.level }), 420);
    } else {
      play("complete");
      buzz("complete");
    }

    const result = await safeCall(quest.id, () => completeQuest(quest.id, tz));
    if (!result.ok) {
      revert(optimisticId);
      if (!isDaily) {
        setQuests((qs) =>
          qs.map((q) => (q.id === quest.id ? { ...q, status: "active" } : q)),
        );
      }
      setRecord(null);
      rejected(result.error);
      return;
    }

    resync();

    // The loot reveal. XP was known before the tap (the honest mirror);
    // only the garnish is random, rolled server-side — the optimistic
    // event showed none rather than a fabricated guess, and is patched
    // with the real roll here. The wait IS the anticipation beat.
    const gold = result.gold ?? 0;
    const item = result.item ?? undefined;
    setEvents((evts) =>
      evts.map((e) =>
        e.id === optimisticId && e.type === "quest_completed"
          ? { ...e, gold, item }
          : e,
      ),
    );
    if (gold > 0) {
      setTimeout(() => {
        play("tick");
        toast(`+${gold} GOLD`, "var(--color-integrity)");
      }, 650);
    }
    if (item) {
      setTimeout(() => {
        play("verify");
        buzz("tap");
        toast(`[ DROP ] ${item}`, "var(--color-integrity)", 3200);
      }, 1500);
    }
  }

  async function handleUndo(quest: QuestRow) {
    if (busy) return;
    initAudio();

    // Latest unretracted completion for this quest in local state. The
    // server re-resolves this independently from the log — this id is only
    // for the optimistic reduce(), and may be a client-generated one.
    const alreadyRetracted = new Set(
      events
        .filter((e) => e.type === "completion_retracted")
        .map((e) => e.retractsEventId),
    );
    const target = [...events]
      .reverse()
      .find(
        (e) =>
          e.type === "quest_completed" &&
          e.questId === quest.id &&
          !alreadyRetracted.has(e.id),
      );

    const isDaily = quest.cadence === "daily";

    // The display has nothing to void. Do NOT pantomime an undo the
    // reducer can't see (the old path appended a retraction aimed at ""
    // and showed a "−0 XP" façade while nothing changed). Ask the server —
    // it resolves the real event from the log — then adopt its answer.
    if (!target) {
      const result = await safeCall(quest.id, () => undoCompletion(quest.id, tz));
      if (!result.ok) {
        rejected(result.error);
        return;
      }
      play("deny");
      toast("[ RETRACTED ] The record stands corrected.", "var(--color-rust)");
      resync();
      return;
    }

    const optimisticId = nextOptimisticId();
    if (!isDaily) {
      setQuests((qs) =>
        qs.map((q) => (q.id === quest.id ? { ...q, status: "active" } : q)),
      );
    }
    const { before, after } = optimisticAppend({
      type: "completion_retracted",
      id: optimisticId,
      timestamp: new Date().toISOString(),
      retractsEventId: target?.id ?? "",
    });

    play("deny");
    buzz("tap");
    toast(`[ RETRACTED ] −${before.totalXp - after.totalXp} XP`, "var(--color-rust)");

    const result = await safeCall(quest.id, () => undoCompletion(quest.id, tz));
    if (!result.ok) {
      revert(optimisticId);
      if (!isDaily) {
        setQuests((qs) =>
          qs.map((q) => (q.id === quest.id ? { ...q, status: "completed" } : q)),
        );
      }
      rejected(result.error);
      return;
    }
    resync();
  }

  /** Remove a quest declared by mistake. The server deletes it only when
   *  it has no history; anything with real completions is archived so the
   *  Chronicle never names an event whose quest vanished. */
  async function handleRemove(quest: QuestRow) {
    if (busy) return;
    const previous = quests;
    setQuests((qs) => qs.filter((q) => q.id !== quest.id));
    const result = await safeCall(quest.id, () => removeQuest(quest.id));
    if (!result.ok) {
      setQuests(previous);
      rejected(result.error);
      return;
    }
    play("deny");
    toast("[ REMOVED ] It is no longer asked of you.", "var(--color-ink-dim)", 2200);
    resync();
  }

  async function onConfirmVerify(evidence: string) {
    const quest = verifying;
    if (!quest) return;
    setVerifying(null);

    const optimisticId = nextOptimisticId();
    setQuests((qs) =>
      qs.map((q) => (q.id === quest.id ? { ...q, status: "completed" } : q)),
    );
    const { before, after } = optimisticAppend({
      type: "claim_verified",
      id: optimisticId,
      timestamp: new Date().toISOString(),
      domain: quest.domain,
      difficulty: quest.difficulty,
      evidence,
    });

    if (after.level > before.level) {
      setTimeout(() => setLevelUp({ from: before.level, to: after.level }), 420);
    }

    const result = await safeCall(quest.id, () => verifyClaim(quest.id, evidence, tz));
    if (!result.ok) {
      revert(optimisticId);
      setQuests((qs) =>
        qs.map((q) => (q.id === quest.id ? { ...q, status: "active" } : q)),
      );
      rejected(result.error);
      return;
    }
    resync();
  }

  async function onNotYet() {
    const quest = verifying;
    if (!quest) return;
    setVerifying(null);

    // The server will refuse a second decline for the same quest, and the
    // reducer wouldn't grant Integrity for it anyway — so don't stage an
    // optimistic "+0 INTEGRITY" flash that the rejection then has to
    // claw back. Refuse locally with the server's own words.
    const alreadyDeclined = events.some(
      (e) => e.type === "claim_declined" && e.questId === quest.id,
    );
    if (alreadyDeclined) {
      rejected("Already held back on this. Nothing further to record.");
      return;
    }

    const optimisticId = nextOptimisticId();
    const { before, after } = optimisticAppend({
      type: "claim_declined",
      id: optimisticId,
      timestamp: new Date().toISOString(),
      questId: quest.id,
    });

    play("deny");
    buzz("tap");
    toast(`+${after.integrity - before.integrity} INTEGRITY`, "var(--color-integrity)");

    const result = await safeCall(quest.id, () => declineClaim(quest.id));
    if (!result.ok) {
      revert(optimisticId);
      rejected(result.error);
      return;
    }
    resync();
  }


  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pt-4 pb-24">
      {/* ---------------- header ---------------- */}
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="font-sys text-[11px] tracking-[0.34em] text-sys">
          THE SYSTEM
        </h1>
        <span className="tnum font-sys text-[10px] text-ink-faint">
          SESSION {seconds}s
        </span>
      </div>

      {fault && (
        <div
          data-testid="fault-line"
          className="mb-3 border border-rust/40 bg-rust/5 px-3 py-2"
        >
          <p className="font-sys text-[11px] leading-relaxed text-rust">
            [ REJECTED ] {fault}
          </p>
          <p className="mt-1 font-sys text-[10px] text-ink-faint">
            The action was reverted. Nothing was recorded.
          </p>
        </div>
      )}

      {/* ================= STATUS ================= */}
      <div className={activeView === "status" ? "" : "hidden"}>
      <>
      <Panel label="Status Window" delay={80}>
        <div className="flex items-center gap-3 p-4">
          <Avatar
            tier={state.tier}
            auraColor={dominant.color}
            consistency={state.daysAbsent <= 3 ? 0.85 : 0.4}
            decay={state.daysAbsent > 3 ? Math.min(0.6, state.daysAbsent / 30) : 0}
            size={120}
          />

          <div className="min-w-0 flex-1">
            <p className="font-sys text-[10px] tracking-[0.22em] text-ink-faint">
              {charName}
            </p>
            <p className="font-display text-2xl leading-tight text-ink">
              {wornTitle}
            </p>
            <p className="mt-0.5 font-sys text-[10px] tracking-[0.16em] text-sys-dim">
              TIER {ROMAN[state.tier - 1]} · {TIER_NAMES[state.tier - 1]}
            </p>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-sys text-[10px] text-ink-faint">LEVEL</span>
              <CountUp
                value={state.level}
                className="font-display text-3xl leading-none text-sys-bright"
              />
            </div>

            <div className="mt-2">
              <div className="relative h-1.5 overflow-hidden bg-void-2 ring-1 ring-edge/60">
                <div
                  className="absolute inset-y-0 left-0 bg-linear-to-r from-sys-dim to-sys-bright"
                  style={{
                    width: `${xpPct}%`,
                    transition: "width 820ms cubic-bezier(0.22, 1.4, 0.36, 1)",
                  }}
                />
              </div>
              <p className="mt-1 flex items-baseline justify-between font-sys text-[10px] text-ink-dim">
                <span>
                  <CountUp value={Math.round(xpPct)} duration={820} tick />% to
                  Level {state.level + 1}
                </span>
                <span className="text-integrity">
                  <CountUp value={state.gold} /> GOLD
                </span>
              </p>
            </div>

            {state.daysAbsent > 3 && (
              <p className="mt-2 font-sys text-[10px] text-rust">
                {state.daysAbsent} days absent. Domains have rusted.
              </p>
            )}
          </div>
        </div>
      </Panel>

      {/* ---------------- domains ---------------- */}
      <Panel label="Domains" delay={220} className="mt-3">
        <div className="px-4 pt-1 pb-3">
          {domains.map((d) => (
            <StatBar key={d.key} domain={d} />
          ))}

          <div className="mt-2 flex items-center justify-between border-t border-edge/60 pt-3">
            <div>
              <span className="font-sys text-[11px] tracking-[0.18em] text-integrity">
                INTEGRITY
              </span>
              <p className="mt-0.5 text-[10px] text-ink-faint">
                Cannot be raised by completing quests
              </p>
            </div>
            <CountUp
              value={state.integrity}
              className="font-sys text-sm text-integrity"
            />
          </div>
        </div>
      </Panel>

      {/* Materials: the requisite economy made visible. A readout of the
          raw domain stat — never spent, so absence can't un-earn it. */}
      <Panel label="Materials" delay={300} className="mt-3">
        <div className="grid grid-cols-3 gap-x-3 gap-y-2 px-4 py-3" data-testid="materials">
          {DOMAIN_KEYS.map((k) => (
            <div key={k} className="flex items-baseline justify-between gap-2">
              <span className="truncate font-sys text-[9px] tracking-[0.1em] text-ink-faint">
                {MATERIAL_NAMES[k].toUpperCase()}
              </span>
              <span className="tnum font-sys text-[11px] text-ink">
                {state.domainsRaw[k]}
              </span>
            </div>
          ))}
        </div>
        <p className="border-t border-edge/40 px-4 py-2 font-sys text-[10px] leading-relaxed text-ink-faint">
          {MATERIAL_LORE}
        </p>
      </Panel>

      {/* Possessions: drops as things owned, not numbers that scrolled by. */}
      <Panel label={`Possessions · ${possessions.length}`} delay={330} className="mt-3">
        {possessions.length > 0 ? (
          <ul data-testid="possessions">
            {possessions.map((pn) => (
              <li key={pn.item} className="border-b border-edge/30 px-4 py-2.5 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm text-ink">{pn.item}</span>
                  <span className="tnum shrink-0 font-sys text-[10px] text-integrity">
                    ×{pn.count}
                  </span>
                </div>
                {ITEM_LORE[pn.item] && (
                  <p className="mt-0.5 font-sys text-[10px] text-ink-faint">
                    {ITEM_LORE[pn.item]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-5 text-center font-sys text-[12px] leading-relaxed text-ink-dim">
            Nothing carried.
            <br />
            Drops come from real work, when they come at all.
          </p>
        )}
      </Panel>

      <TitlesPanel
        state={state}
        events={events}
        currentTitle={wornTitle}
        onTitleChosen={setWornTitle}
        onRejected={rejected}
        delay={360}
      />
      </>
      </div>

      {/* ================= TODAY ================= */}
      <div className={activeView === "today" ? "" : "hidden"}>
      <>
      <Panel
        label={`Today · ${outstanding.length} remaining`}
        delay={360}
        className="mt-3"
      >
        {hasAnyQuests ? (
          <ul>
            {dailyQuests.map((q) => {
              const domain = DOMAIN_DISPLAY[q.domain];
              const stats = state.questStats[q.id];
              const isDaily = q.cadence === "daily";
              const done = isDaily ? !!stats?.doneToday : q.status !== "active";
              return (
                <li
                  key={q.id}
                  className="flex items-center border-b border-edge/40 last:border-b-0"
                >
                  <button
                    onClick={() => handleQuestTap(q)}
                    disabled={busy === q.id}
                    data-testid={`quest-${q.id}`}
                    className={`flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sys/5 disabled:opacity-40 ${
                      done ? "opacity-40" : ""
                    }`}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center border text-[11px]"
                      style={{
                        borderColor: done ? "var(--color-edge)" : domain.color,
                        color: domain.color,
                      }}
                    >
                      {done ? "✓" : ""}
                    </span>

                    <span className="min-w-0 flex-1">
                      {epicOf(q) && (
                        <span
                          className="block truncate font-sys text-[9px] tracking-[0.16em]"
                          style={{ color: domain.color, opacity: 0.75 }}
                        >
                          {q.weighty ? "MILESTONE · " : ""}
                          {epicOf(q)!.title.toUpperCase()}
                        </span>
                      )}
                      <span
                        className={`block truncate text-sm ${
                          done ? "text-ink-faint line-through" : "text-ink"
                        }`}
                      >
                        {q.title}
                      </span>
                      <span className="mt-0.5 block truncate font-sys text-[10px] text-ink-faint">
                        {q.when_text} · {q.where_text}
                        {isDaily && stats && stats.streak > 0 && (
                          <>
                            {" · "}
                            <span className="text-integrity">
                              {stats.streak}d streak
                            </span>
                            {stats.bestStreak > stats.streak &&
                              ` · best ${stats.bestStreak}`}
                          </>
                        )}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span
                        className="block font-sys text-[10px] tracking-[0.12em]"
                        style={{ color: domain.color }}
                      >
                        {isDaily ? `DAILY · ${q.difficulty}` : q.difficulty}
                      </span>
                      {q.weighty && !done && !requisitesFor(q).met && (
                        <span
                          className="block font-sys text-[9px] tracking-[0.12em] text-rust"
                          data-testid={`locked-${q.id}`}
                        >
                          LOCKED
                        </span>
                      )}
                      <span className="tnum block font-sys text-[11px] text-ink-dim">
                        {XP_BY_DIFFICULTY[q.difficulty]} XP
                      </span>
                    </span>
                  </button>

                  {!done && (
                    <button
                      onClick={() => handleRemove(q)}
                      disabled={busy === q.id}
                      data-testid={`remove-${q.id}`}
                      aria-label={`Remove ${q.title}`}
                      className="mr-3 min-h-11 shrink-0 self-stretch border border-edge px-3 font-sys text-[10px] tracking-[0.14em] text-ink-faint transition-colors hover:border-rust/60 hover:text-rust disabled:opacity-40"
                    >
                      ✕
                    </button>
                  )}

                  {/* Misclick escape hatch. Never on weighty quests — a
                      verified claim only exits via the seasonal audit. */}
                  {done && !q.weighty && (
                    <button
                      onClick={() => handleUndo(q)}
                      disabled={busy === q.id}
                      data-testid={`undo-${q.id}`}
                      aria-label={`Undo completion of ${q.title}`}
                      className="mr-3 min-h-11 shrink-0 self-stretch border border-edge px-3.5 font-sys text-[10px] tracking-[0.14em] text-ink-faint transition-colors hover:border-rust/60 hover:text-rust disabled:opacity-40"
                    >
                      UNDO
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center font-sys text-[12px] leading-relaxed text-ink-dim">
            Nothing declared yet.
            <br />
            The System has nothing to measure until you do.
          </p>
        )}

        <NewQuestForm
          open={newQuestOpen}
          onOpenChange={setNewQuestOpen}
          epics={epics}
          dailies={dailyQuests.filter((q) => q.cadence === "daily")}
          onCreated={(quest) => {
            setQuests((qs) => [...qs, quest]);
            setNewQuestOpen(false);
          }}
        />
      </Panel>

      {/* ---------------- close-out ritual ---------------- */}
      {dayClosed && (
        <Panel label="Day closed" delay={120} className="mt-3" tone="gold">
          <div className="px-4 py-5 text-center" data-testid="day-closed">
            <p className="font-sys text-[12px] leading-relaxed text-integrity">
              [ COMPLETE ] Nothing further is required of you today.
            </p>

            {/* The day, stated. Cap-aware XP — never nominal arithmetic. */}
            <p className="tnum mt-3 font-sys text-[11px] text-ink-dim">
              {dayReport.completionsToday} done · {dayReport.xpToday} XP banked
            </p>

            {/* The week held against every week before it. The comparison
                is the System's entire opinion. */}
            {weekReport.thisWeek > 0 && (
              <p className="tnum mt-1 font-sys text-[11px] text-ink-dim">
                {weekReport.thisWeek} this week
                {weekReport.isBestWeek
                  ? " — your best week on record."
                  : ` · best week: ${weekReport.bestWeek}`}
              </p>
            )}

            <p className="mt-3 font-sys text-[11px] text-ink-faint">
              Session: {seconds}s. Close this and go live your life.
            </p>
          </div>
        </Panel>
      )}
      </>
      </div>

      {/* ================= CAMPAIGN ================= */}
      <div className={activeView === "campaign" ? "" : "hidden"}>
        <>
          <EpicsPanel
            epics={epics}
            quests={quests}
            delay={80}
            onCreated={(epic) => setEpics((es) => [...es, epic])}
            onChanged={(epic) =>
              setEpics((es) =>
                epic.status === "abandoned"
                  ? es.filter((e) => e.id !== epic.id)
                  : es.map((e) => (e.id === epic.id ? epic : e)),
              )
            }
            onRejected={rejected}
          />

          {/* Milestones live here, not in TODAY. A claim is a statement
              about a chapter of your life; listing it beside "brush teeth"
              made the Verification Screen read as another checkbox. */}
          <Panel
            label={`Milestones · ${milestoneQuests.filter((q) => q.status === "active").length} unclaimed`}
            delay={200}
            className="mt-3"
          >
            {milestoneQuests.length > 0 ? (
              <ul>
                {milestoneQuests.map((q) => {
                  const domain = DOMAIN_DISPLAY[q.domain];
                  const claimed = q.status !== "active";
                  const locked = !claimed && !requisitesFor(q).met;
                  return (
                    <li
                      key={q.id}
                      className="flex items-center border-b border-edge/40 last:border-b-0"
                    >
                      <button
                        onClick={() => handleQuestTap(q)}
                        disabled={busy === q.id}
                        data-testid={`quest-${q.id}`}
                        className={`flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sys/5 ${
                          claimed ? "opacity-40" : ""
                        }`}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center border text-[11px]"
                          style={{
                            borderColor: claimed ? "var(--color-edge)" : domain.color,
                            color: domain.color,
                          }}
                        >
                          {claimed ? "✓" : ""}
                        </span>
                        <span className="min-w-0 flex-1">
                          {epicOf(q) && (
                            <span
                              className="block truncate font-sys text-[9px] tracking-[0.16em]"
                              style={{ color: domain.color, opacity: 0.75 }}
                            >
                              {epicOf(q)!.title.toUpperCase()}
                            </span>
                          )}
                          <span
                            className={`block truncate text-sm ${
                              claimed ? "text-ink-faint line-through" : "text-ink"
                            }`}
                          >
                            {q.title}
                          </span>
                          <span className="mt-0.5 block truncate font-sys text-[10px] text-ink-faint">
                            {q.when_text} · {q.where_text}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span
                            className="block font-sys text-[10px] tracking-[0.12em]"
                            style={{ color: domain.color }}
                          >
                            {q.difficulty}
                          </span>
                          {locked && (
                            <span
                              className="block font-sys text-[9px] tracking-[0.12em] text-rust"
                              data-testid={`locked-${q.id}`}
                            >
                              LOCKED
                            </span>
                          )}
                        </span>
                      </button>

                      {/* Same-day misclick window. Older claims stand and
                          exit only through the seasonal audit. */}
                      {claimed && (
                        <button
                          onClick={() => handleUndo(q)}
                          disabled={busy === q.id}
                          data-testid={`undo-${q.id}`}
                          aria-label={`Undo claim of ${q.title}`}
                          className="mr-3 min-h-11 shrink-0 self-stretch border border-edge px-3.5 font-sys text-[10px] tracking-[0.14em] text-ink-faint transition-colors hover:border-rust/60 hover:text-rust disabled:opacity-40"
                        >
                          UNDO
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-5 text-center font-sys text-[12px] leading-relaxed text-ink-dim">
                No milestones declared.
                <br />
                An epic advances only when one is claimed.
              </p>
            )}
          </Panel>
        </>
      </div>

      {/* ================= RECORD ================= */}
      <div className={activeView === "chronicle" ? "" : "hidden"}>
        <ChroniclePanel ledger={ledger} entries={chronicle} delay={80} />
      </div>

      {/* ================= SYSTEM ================= */}
      <div className={activeView === "system" ? "" : "hidden"}>
        <SystemPanel
          delay={80}
          onRejected={rejected}
          onReset={() => {
            // A FULL page load, not router.refresh(). Reset changes props
            // that are only read at mount — `riteOpen` is seeded from the
            // profile name, so after a reset the first-run rite would not
            // greet you again until you happened to reload. That is
            // exactly what "I had to sign out and back in" was.
            toast("[ RESET ] The record begins again.", "var(--color-sys)", 2000);
            if (actions.resync) {
              // Harness: no real navigation to perform.
              setView("status");
              actions.resync();
            } else {
              setTimeout(() => window.location.assign("/"), 700);
            }
          }}
        />
      </div>

      <p className="mt-6 text-center font-sys text-[10px] leading-relaxed text-ink-faint">
        The goal of the game is not to play the game.
      </p>

      {/* ---------------- floating xp ---------------- */}
      <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex flex-col items-center">
        {toasts.map((t) => (
          <span
            key={t.id}
            className="animate-drift tnum font-sys text-lg"
            style={{ color: t.color, textShadow: `0 0 16px ${t.color}` }}
          >
            {t.text}
          </span>
        ))}
      </div>

      {/* ---------------- overlays ---------------- */}
      {riteOpen && (
        <FirstRunRite
          onNamed={setCharName}
          onDone={() => setRiteOpen(false)}
        />
      )}

      {verifying && (
        <VerificationScreen
          quest={verifying}
          epic={epicOf(verifying)}
          requisites={requisitesFor(verifying)}
          onConfirm={onConfirmVerify}
          onNotYet={onNotYet}
        />
      )}

      {levelUp && (
        <LevelUpOverlay
          from={levelUp.from}
          to={levelUp.to}
          onDone={() => setLevelUp(null)}
        />
      )}

      {record && !levelUp && (
        <RecordOverlay
          quest={record.quest}
          streak={record.streak}
          previous={record.previous}
          onDone={() => setRecord(null)}
        />
      )}

      <SystemNav
        view={activeView}
        onChange={setView}
        outstanding={outstanding.length}
        level={state.level}
      />

      {tierUp && (
        <TierUpOverlay
          from={tierUp.from}
          to={tierUp.to}
          auraColor={dominant.color}
          integrity={state.integrity}
          onDone={() => setTierUp(null)}
        />
      )}
    </main>
  );
}

function NewQuestForm({
  open,
  onOpenChange,
  epics,
  dailies,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  epics: EpicRow[];
  /** Existing daily quests, offered as streak-requisite targets. */
  dailies: QuestRow[];
  onCreated: (quest: QuestRow) => void;
}) {
  const { createQuest } = useActions();
  const [epicId, setEpicId] = useState("");
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState<DomainKey>("vitality");
  const [difficulty, setDifficulty] = useState<Difficulty>("STANDARD");
  const [whenText, setWhenText] = useState("");
  const [whereText, setWhereText] = useState("");
  const [weighty, setWeighty] = useState(false);
  const [cadence, setCadence] = useState<"once" | "daily">("daily");
  // Preparation the milestone will ask about. Optional; empty = ungated.
  const [reqDomain, setReqDomain] = useState<"" | DomainKey>("");
  const [reqAmount, setReqAmount] = useState("");
  const [reqStreakQuest, setReqStreakQuest] = useState("");
  const [reqStreakDays, setReqStreakDays] = useState("");
  const [grants, setGrants] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => onOpenChange(true)}
        className="w-full border-t border-edge/60 px-4 py-3 text-left font-sys text-[11px] tracking-[0.16em] text-ink-dim transition-colors hover:bg-sys/5 hover:text-sys"
      >
        + DECLARE A QUEST
      </button>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Explicit, visible validation. The QA pass found the native
    // `required` bubbles unreliable in some environments — a submit with
    // empty fields just silently did nothing, which reads as the app
    // being broken. The System states what's missing instead.
    if (!title.trim()) {
      setError("A quest needs a title.");
      return;
    }
    if (!whenText.trim() || !whereText.trim()) {
      setError(
        "When and where are not optional. An intention without them is a wish.",
      );
      return;
    }
    setSubmitting(true);
    setError("");
    // Assemble declared preparation. Server re-validates every field and
    // derives the streak label from its own quest row, never from us.
    const requisites: Requisite[] = [];
    if (weighty && reqDomain && parseInt(reqAmount, 10) > 0) {
      requisites.push({
        kind: "material",
        domain: reqDomain,
        amount: parseInt(reqAmount, 10),
      });
    }
    if (weighty && reqStreakQuest && parseInt(reqStreakDays, 10) > 1) {
      requisites.push({
        kind: "streak",
        questId: reqStreakQuest,
        days: parseInt(reqStreakDays, 10),
        label: dailies.find((d) => d.id === reqStreakQuest)?.title ?? "a discipline",
      });
    }

    const result = await createQuest({
      epicId: epicId || null,
      title,
      domain,
      difficulty,
      whenText,
      whereText,
      weighty,
      cadence,
      grants,
      requisites: requisites.length > 0 ? requisites : null,
    });
    setSubmitting(false);
    if (!result.ok || !result.id) {
      setError(result.ok ? "Something went wrong." : result.error);
      return;
    }
    onCreated({
      id: result.id,
      epic_id: epicId || null,
      title: title.trim(),
      domain,
      difficulty,
      when_text: whenText.trim(),
      where_text: whereText.trim(),
      weighty,
      cadence: weighty ? "once" : cadence,
      requisites: requisites.length > 0 ? requisites : null,
      grants: weighty ? grants.trim() || null : null,
      status: "active",
    });
    setTitle("");
    setWhenText("");
    setWhereText("");
    setWeighty(false);
    setGrants("");
    setReqDomain("");
    setReqAmount("");
    setReqStreakQuest("");
    setReqStreakDays("");
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="animate-rise border-t border-edge/60 px-4 py-4"
    >
      {epics.length > 0 && (
        <label className="mb-3 block">
          <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
            PART OF
          </span>
          <select
            value={epicId}
            onChange={(e) => setEpicId(e.target.value)}
            className="mt-1.5 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink focus:border-sys focus:outline-none"
          >
            <option value="" className="bg-panel">
              Nothing larger
            </option>
            {epics
              .filter((e) => e.status === "active")
              .map((e) => (
                <option key={e.id} value={e.id} className="bg-panel">
                  {e.title}
                </option>
              ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
          TITLE
        </span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Train — lower body"
          className="mt-1.5 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
            DOMAIN
          </span>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value as DomainKey)}
            className="mt-1.5 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink focus:border-sys focus:outline-none"
          >
            {DOMAIN_KEYS.map((k) => (
              <option key={k} value={k} className="bg-panel">
                {DOMAIN_DISPLAY[k].label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
            DIFFICULTY
          </span>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            className="mt-1.5 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink focus:border-sys focus:outline-none"
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d} className="bg-panel">
                {d} · {XP_BY_DIFFICULTY[d]} XP
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Implementation intention: when and where, not just what. */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
            WHEN
          </span>
          <input
            required
            value={whenText}
            onChange={(e) => setWhenText(e.target.value)}
            placeholder="e.g. 06:40"
            className="mt-1.5 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
            WHERE
          </span>
          <input
            required
            value={whereText}
            onChange={(e) => setWhereText(e.target.value)}
            placeholder="e.g. Gym"
            className="mt-1.5 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
          />
        </label>
      </div>

      {!weighty && (
        <div className="mt-4">
          <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
            CADENCE
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            {(["daily", "once"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCadence(c)}
                className={`border py-2 font-sys text-[10px] tracking-[0.14em] transition-colors ${
                  cadence === c
                    ? "border-sys/60 bg-sys/10 text-sys-bright"
                    : "border-edge text-ink-dim hover:border-sys/40"
                }`}
              >
                {c === "daily" ? "DAILY · BUILDS A STREAK" : "ONCE"}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="mt-4 flex items-center gap-2">
        <input
          type="checkbox"
          checked={weighty}
          onChange={(e) => setWeighty(e.target.checked)}
          className="accent-sys"
        />
        <span className="font-sys text-[11px] text-ink-dim">
          Milestone — requires verification, not a tap
        </span>
      </label>

      {weighty && (
        <label className="mt-3 block">
          <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
            FLAVOUR TEXT SHOWN ON VERIFICATION (optional — cosmetic only, grants nothing beyond the XP above)
          </span>
          <input
            value={grants}
            onChange={(e) => setGrants(e.target.value)}
            placeholder="[Founder's Signet]"
            className="mt-1.5 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
          />
        </label>
      )}

      {weighty && (
        <div className="mt-4 border-l-2 border-edge pl-3">
          <p className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
            PREPARATION (OPTIONAL)
          </p>
          <p className="mt-1 font-sys text-[10px] leading-relaxed text-ink-faint">
            A gate you set for yourself. It never blocks the claim — it makes
            an unready one say so.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-sys text-[9px] tracking-[0.16em] text-ink-faint">
                MATERIAL
              </span>
              <select
                value={reqDomain}
                onChange={(e) => setReqDomain(e.target.value as "" | DomainKey)}
                data-testid="req-domain"
                className="mt-1 w-full border-b border-edge bg-transparent pb-1 font-sys text-[12px] text-ink focus:border-sys focus:outline-none"
              >
                <option value="" className="bg-panel">
                  None
                </option>
                {DOMAIN_KEYS.map((k) => (
                  <option key={k} value={k} className="bg-panel">
                    {MATERIAL_NAMES[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-sys text-[9px] tracking-[0.16em] text-ink-faint">
                AMOUNT
              </span>
              <input
                type="number"
                min={1}
                max={1000}
                value={reqAmount}
                onChange={(e) => setReqAmount(e.target.value)}
                placeholder="e.g. 40"
                data-testid="req-amount"
                className="mt-1 w-full border-b border-edge bg-transparent pb-1 font-sys text-[12px] text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
              />
            </label>
          </div>

          {dailies.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="font-sys text-[9px] tracking-[0.16em] text-ink-faint">
                  STREAK ON
                </span>
                <select
                  value={reqStreakQuest}
                  onChange={(e) => setReqStreakQuest(e.target.value)}
                  data-testid="req-streak-quest"
                  className="mt-1 w-full border-b border-edge bg-transparent pb-1 font-sys text-[12px] text-ink focus:border-sys focus:outline-none"
                >
                  <option value="" className="bg-panel">
                    None
                  </option>
                  {dailies.map((d) => (
                    <option key={d.id} value={d.id} className="bg-panel">
                      {d.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="font-sys text-[9px] tracking-[0.16em] text-ink-faint">
                  CONSECUTIVE DAYS
                </span>
                <input
                  type="number"
                  min={2}
                  max={365}
                  value={reqStreakDays}
                  onChange={(e) => setReqStreakDays(e.target.value)}
                  placeholder="e.g. 21"
                  data-testid="req-streak-days"
                  className="mt-1 w-full border-b border-edge bg-transparent pb-1 font-sys text-[12px] text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 font-sys text-[11px] text-rust">[ REJECTED ] {error}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="border border-edge py-2.5 font-sys text-[11px] tracking-[0.16em] text-ink-dim transition-colors hover:border-rust/50"
        >
          CANCEL
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="border border-sys/60 bg-sys/10 py-2.5 font-sys text-[11px] tracking-[0.16em] text-sys-bright transition-colors hover:bg-sys/20 disabled:opacity-40"
        >
          {submitting ? "…" : "DECLARE"}
        </button>
      </div>
    </form>
  );
}
