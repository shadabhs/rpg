"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Panel } from "@/components/Panel";
import { Avatar } from "@/components/Avatar";
import { StatBar } from "@/components/StatBar";
import { CountUp } from "@/components/CountUp";
import { VerificationScreen } from "@/components/VerificationScreen";
import { LevelUpOverlay } from "@/components/LevelUpOverlay";
import { TierUpOverlay } from "@/components/TierUpOverlay";
import { initAudio, play, setMuted } from "@/lib/sound";
import { useMuted } from "@/lib/hooks";
import { buzz } from "@/lib/haptics";
import { reduce } from "@/lib/engine/reducer";
import type { SystemEvent } from "@/lib/engine/events";
import { DOMAIN_KEYS, DOMAIN_DISPLAY, type DomainKey } from "@/lib/engine/domains";
import { XP_BY_DIFFICULTY, TIER_NAMES, type Difficulty } from "@/lib/engine/rules";
import type { QuestRow } from "@/db/mappers";
import {
  completeQuest,
  undoCompletion,
  verifyClaim,
  declineClaim,
  createQuest,
  signOut,
} from "@/app/actions";

type Toast = { id: number; text: string; color: string };

const ROMAN = ["I", "II", "III", "IV", "V"];
const DIFFICULTIES: Difficulty[] = ["TRIVIAL", "STANDARD", "HARD", "SEVERE"];

export function StatusWindowClient({
  characterName,
  title,
  initialEvents,
  initialQuests,
}: {
  characterName: string;
  title: string;
  initialEvents: SystemEvent[];
  initialQuests: QuestRow[];
}) {
  const [events, setEvents] = useState<SystemEvent[]>(initialEvents);
  const [quests, setQuests] = useState<QuestRow[]>(initialQuests);
  const muted = useMuted();

  const [verifying, setVerifying] = useState<QuestRow | null>(null);
  const [levelUp, setLevelUp] = useState<{ from: number; to: number } | null>(null);
  const [tierUp, setTierUp] = useState<{ from: number; to: number } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newQuestOpen, setNewQuestOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [seconds, setSeconds] = useState(0);
  const toastId = useRef(0);
  const optimisticId = useRef(0);
  const prevTier = useRef<number | null>(null);
  function nextOptimisticId() {
    optimisticId.current += 1;
    return `optimistic-${optimisticId.current}`;
  }

  useEffect(() => {
    const i = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, []);

  // The single source of truth for level/XP/Integrity/domains/tier. Same
  // pure function the server uses to persist truth — running it here too
  // is what makes the optimistic update exact rather than approximate.
  const state = useMemo(() => reduce(events), [events]);

  const domains = DOMAIN_KEYS.map((key) => ({
    key,
    ...DOMAIN_DISPLAY[key],
    value: state.domains[key],
  }));

  const dominant = useMemo(
    () => domains.reduce((a, b) => (b.value > a.value ? b : a)),
    [domains],
  );

  const activeQuests = quests.filter((q) => q.status === "active");
  const hasAnyQuests = quests.length > 0;
  const dayClosed = hasAnyQuests && activeQuests.length === 0;
  const xpPct = Math.min(100, (state.xpIntoLevel / state.xpForNextLevel) * 100);

  // Fire the tier overlay whenever the derived tier actually rises —
  // never a button, always a consequence of what reduce() computed.
  useEffect(() => {
    if (prevTier.current !== null && state.tier > prevTier.current) {
      setTierUp({ from: prevTier.current, to: state.tier });
    }
    prevTier.current = state.tier;
  }, [state.tier]);

  function toast(text: string, color: string) {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, color }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 1100);
  }

  function optimisticAppend(event: SystemEvent) {
    const before = reduce(events);
    const nextEvents = [...events, event];
    const after = reduce(nextEvents);
    setEvents(nextEvents);
    return { before, after };
  }

  function revert(eventId: string) {
    setEvents((evts) => evts.filter((e) => e.id !== eventId));
  }

  async function handleQuestTap(quest: QuestRow) {
    if (quest.status !== "active" || busy) return;
    initAudio();

    if (quest.weighty) {
      setVerifying(quest);
      return;
    }

    const optimisticId = nextOptimisticId();
    setQuests((qs) =>
      qs.map((q) => (q.id === quest.id ? { ...q, status: "completed" } : q)),
    );
    const { before, after } = optimisticAppend({
      type: "quest_completed",
      id: optimisticId,
      timestamp: new Date().toISOString(),
      domain: quest.domain,
      difficulty: quest.difficulty,
      questId: quest.id,
    });

    const gain = XP_BY_DIFFICULTY[quest.difficulty];
    toast(`+${gain} XP`, DOMAIN_DISPLAY[quest.domain].color);

    if (after.level > before.level) {
      setTimeout(() => setLevelUp({ from: before.level, to: after.level }), 420);
    } else {
      play("complete");
      buzz("complete");
    }

    setBusy(quest.id);
    const result = await completeQuest(quest.id);
    setBusy(null);
    if (!result.ok) {
      revert(optimisticId);
      setQuests((qs) =>
        qs.map((q) => (q.id === quest.id ? { ...q, status: "active" } : q)),
      );
      toast(`[ REJECTED ] ${result.error}`, "var(--color-rust)");
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

    const optimisticId = nextOptimisticId();
    setQuests((qs) =>
      qs.map((q) => (q.id === quest.id ? { ...q, status: "active" } : q)),
    );
    const { before, after } = optimisticAppend({
      type: "completion_retracted",
      id: optimisticId,
      timestamp: new Date().toISOString(),
      retractsEventId: target?.id ?? "",
    });

    play("deny");
    buzz("tap");
    toast(`[ RETRACTED ] −${before.totalXp - after.totalXp} XP`, "var(--color-rust)");

    setBusy(quest.id);
    const result = await undoCompletion(quest.id);
    setBusy(null);
    if (!result.ok) {
      revert(optimisticId);
      setQuests((qs) =>
        qs.map((q) => (q.id === quest.id ? { ...q, status: "completed" } : q)),
      );
      toast(`[ REJECTED ] ${result.error}`, "var(--color-rust)");
    }
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

    const result = await verifyClaim(quest.id, evidence);
    if (!result.ok) {
      revert(optimisticId);
      setQuests((qs) =>
        qs.map((q) => (q.id === quest.id ? { ...q, status: "active" } : q)),
      );
      toast(`[ REJECTED ] ${result.error}`, "var(--color-rust)");
    }
  }

  async function onNotYet() {
    const quest = verifying;
    if (!quest) return;
    setVerifying(null);

    const optimisticId = nextOptimisticId();
    const { before, after } = optimisticAppend({
      type: "claim_declined",
      id: optimisticId,
      timestamp: new Date().toISOString(),
    });

    play("deny");
    buzz("tap");
    toast(`+${after.integrity - before.integrity} INTEGRITY`, "var(--color-integrity)");

    const result = await declineClaim(quest.id);
    if (!result.ok) {
      revert(optimisticId);
      toast(`[ REJECTED ] ${result.error}`, "var(--color-rust)");
    }
  }

  function toggleMute() {
    initAudio();
    const next = !muted;
    setMuted(next);
    if (!next) play("panel");
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pt-4 pb-24">
      {/* ---------------- header ---------------- */}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="font-sys text-[11px] tracking-[0.34em] text-sys">
          THE SYSTEM
        </h1>
        <div className="flex items-center gap-3">
          <span className="tnum font-sys text-[10px] text-ink-faint">
            SESSION {seconds}s
          </span>
          <button
            onClick={toggleMute}
            aria-pressed={muted}
            className="border border-edge px-2 py-1 font-sys text-[10px] tracking-[0.16em] text-ink-dim transition-colors hover:border-sys/60 hover:text-sys"
          >
            {muted ? "SOUND OFF" : "SOUND ON"}
          </button>
          <form action={signOut}>
            <button
              type="submit"
              className="border border-edge px-2 py-1 font-sys text-[10px] tracking-[0.16em] text-ink-dim transition-colors hover:border-rust/60 hover:text-rust"
            >
              SIGN OUT
            </button>
          </form>
        </div>
      </div>

      {/* ---------------- status window ---------------- */}
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
              {characterName}
            </p>
            <p className="font-display text-2xl leading-tight text-ink">{title}</p>
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
              <p className="mt-1 font-sys text-[10px] text-ink-dim">
                <CountUp value={Math.round(xpPct)} duration={820} tick />% to Level{" "}
                {state.level + 1}
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

      {/* ---------------- today ---------------- */}
      <Panel
        label={`Today · ${activeQuests.length} remaining`}
        delay={360}
        className="mt-3"
      >
        {hasAnyQuests ? (
          <ul>
            {quests.map((q) => {
              const domain = DOMAIN_DISPLAY[q.domain];
              const done = q.status !== "active";
              return (
                <li
                  key={q.id}
                  className="flex items-center border-b border-edge/40 last:border-b-0"
                >
                  <button
                    onClick={() => handleQuestTap(q)}
                    disabled={done || busy === q.id}
                    data-testid={`quest-${q.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sys/5 disabled:opacity-40"
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
                      <span
                        className={`block truncate text-sm ${
                          done ? "text-ink-faint line-through" : "text-ink"
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
                      <span className="tnum block font-sys text-[11px] text-ink-dim">
                        {XP_BY_DIFFICULTY[q.difficulty]} XP
                      </span>
                    </span>
                  </button>

                  {/* Misclick escape hatch. Never on weighty quests — a
                      verified claim only exits via the seasonal audit. */}
                  {done && !q.weighty && (
                    <button
                      onClick={() => handleUndo(q)}
                      disabled={busy === q.id}
                      data-testid={`undo-${q.id}`}
                      className="mr-4 shrink-0 border border-edge px-2 py-1 font-sys text-[10px] tracking-[0.14em] text-ink-faint transition-colors hover:border-rust/60 hover:text-rust disabled:opacity-40"
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
          onCreated={(quest) => {
            setQuests((qs) => [...qs, quest]);
            setNewQuestOpen(false);
          }}
        />
      </Panel>

      {/* ---------------- close-out ---------------- */}
      {dayClosed && (
        <Panel label="Day closed" delay={120} className="mt-3" tone="gold">
          <div className="px-4 py-5 text-center" data-testid="day-closed">
            <p className="font-sys text-[12px] leading-relaxed text-integrity">
              [ COMPLETE ] Nothing further is required of you today.
            </p>
            <p className="mt-2 font-sys text-[11px] text-ink-dim">
              Session: {seconds}s. Close this and go live your life.
            </p>
          </div>
        </Panel>
      )}

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
      {verifying && (
        <VerificationScreen
          quest={verifying}
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
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (quest: QuestRow) => void;
}) {
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState<DomainKey>("vitality");
  const [difficulty, setDifficulty] = useState<Difficulty>("STANDARD");
  const [whenText, setWhenText] = useState("");
  const [whereText, setWhereText] = useState("");
  const [weighty, setWeighty] = useState(false);
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
    setSubmitting(true);
    setError("");
    const result = await createQuest({
      title,
      domain,
      difficulty,
      whenText,
      whereText,
      weighty,
      grants,
    });
    setSubmitting(false);
    if (!result.ok || !result.id) {
      setError(result.ok ? "Something went wrong." : result.error);
      return;
    }
    onCreated({
      id: result.id,
      title: title.trim(),
      domain,
      difficulty,
      when_text: whenText.trim(),
      where_text: whereText.trim(),
      weighty,
      grants: weighty ? grants.trim() || null : null,
      status: "active",
    });
    setTitle("");
    setWhenText("");
    setWhereText("");
    setWeighty(false);
    setGrants("");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="animate-rise border-t border-edge/60 px-4 py-4"
    >
      <label className="block">
        <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
          TITLE
        </span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Train — lower body"
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
            placeholder="06:40"
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
            placeholder="Gym"
            className="mt-1.5 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
          />
        </label>
      </div>

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
