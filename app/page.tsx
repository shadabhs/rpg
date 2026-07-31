"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  CHARACTER,
  DOMAINS,
  LEDGER,
  QUESTS,
  TIER_NAMES,
  XP_BY_DIFFICULTY,
  type Domain,
  type Quest,
} from "@/lib/data";

type Toast = { id: number; text: string; color: string };

const ROMAN = ["I", "II", "III", "IV", "V"];

export default function StatusWindow() {
  const [quests, setQuests] = useState<Quest[]>(QUESTS);
  const [domains, setDomains] = useState<Domain[]>(DOMAINS);
  const [level, setLevel] = useState(CHARACTER.level);
  const [xp, setXp] = useState(CHARACTER.xpIntoLevel);
  const [tier, setTier] = useState(CHARACTER.tier);
  const [integrity, setIntegrity] = useState(CHARACTER.integrity);
  // Read from the external store rather than mirrored into state.
  const muted = useMuted();

  const [verifying, setVerifying] = useState<Quest | null>(null);
  const [levelUp, setLevelUp] = useState<{ from: number; to: number } | null>(null);
  const [tierUp, setTierUp] = useState<{ from: number; to: number } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [seconds, setSeconds] = useState(0);
  const toastId = useRef(0);

  useEffect(() => {
    const i = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const dominant = useMemo(
    () => domains.reduce((a, b) => (b.value > a.value ? b : a)),
    [domains],
  );

  const remaining = quests.filter((q) => !q.done);
  const dayClosed = remaining.length === 0;
  const xpPct = Math.min(100, (xp / CHARACTER.xpForLevel) * 100);

  function toast(text: string, color: string) {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, color }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 1100);
  }

  function award(quest: Quest) {
    const gain = XP_BY_DIFFICULTY[quest.difficulty];

    setQuests((qs) => qs.map((q) => (q.id === quest.id ? { ...q, done: true } : q)));
    setDomains((ds) =>
      ds.map((d) =>
        d.key === quest.domain
          ? {
              ...d,
              value: d.value + Math.max(1, Math.round(gain / 20)),
              trend: d.trend + 1,
            }
          : d,
      ),
    );

    const domain = domains.find((d) => d.key === quest.domain);
    toast(`+${gain} XP`, domain?.color ?? "var(--color-sys)");

    const next = xp + gain;
    if (next >= CHARACTER.xpForLevel) {
      setXp(next - CHARACTER.xpForLevel);
      const from = level;
      const to = level + 1;
      setLevel(to);
      // The overlay owns the beat of silence, so no sound fires here.
      setTimeout(() => setLevelUp({ from, to }), 420);
    } else {
      setXp(next);
      play("complete");
      buzz("complete");
    }
  }

  function onQuestTap(quest: Quest) {
    if (quest.done) return;
    initAudio();

    // Friction scaled to stakes. Dailies are one tap; milestones are not.
    if (quest.weighty) {
      setVerifying(quest);
      return;
    }
    award(quest);
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
          {/* Session time shown as a virtue when it's low — a permanent check
              on scope creep. Any feature that raises this must justify itself. */}
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
        </div>
      </div>

      {/* ---------------- status window ---------------- */}
      <Panel label="Status Window" delay={80}>
        <div className="flex items-center gap-3 p-4">
          <Avatar
            tier={tier}
            auraColor={dominant.color}
            consistency={0.75}
            size={120}
          />

          <div className="min-w-0 flex-1">
            <p className="font-sys text-[10px] tracking-[0.22em] text-ink-faint">
              {CHARACTER.name}
            </p>
            <p className="font-display text-2xl leading-tight text-ink">
              {CHARACTER.title}
            </p>
            <p className="mt-0.5 font-sys text-[10px] tracking-[0.16em] text-sys-dim">
              TIER {ROMAN[tier - 1]} · {TIER_NAMES[tier - 1]}
            </p>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-sys text-[10px] text-ink-faint">LEVEL</span>
              <CountUp
                value={level}
                className="font-display text-3xl leading-none text-sys-bright"
              />
            </div>

            {/* Goal gradient: always show proximity, never raw totals. */}
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
                {level + 1}
              </p>
            </div>
          </div>
        </div>
      </Panel>

      {/* ---------------- domains ---------------- */}
      <Panel label="Domains" delay={220} className="mt-3">
        <div className="px-4 pt-1 pb-3">
          {domains.map((d) => (
            <StatBar key={d.key} domain={d} />
          ))}

          {/* Integrity renders apart from the six. Never interviewed, starts at
              a neutral baseline, only ever rises. */}
          <div className="mt-2 flex items-center justify-between border-t border-edge/60 pt-3">
            <div>
              <span className="font-sys text-[11px] tracking-[0.18em] text-integrity">
                INTEGRITY
              </span>
              <p className="mt-0.5 text-[10px] text-ink-faint">
                Cannot be raised by completing quests
              </p>
            </div>
            <CountUp value={integrity} className="font-sys text-sm text-integrity" />
          </div>
        </div>
      </Panel>

      {/* ---------------- today ---------------- */}
      <Panel
        label={`Today · ${remaining.length} remaining`}
        delay={360}
        className="mt-3"
      >
        <ul>
          {quests.map((q) => {
            const domain = domains.find((d) => d.key === q.domain)!;
            return (
              <li key={q.id} className="border-b border-edge/40 last:border-b-0">
                <button
                  onClick={() => onQuestTap(q)}
                  disabled={q.done}
                  data-testid={`quest-${q.id}`}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sys/5 disabled:opacity-40"
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center border text-[11px]"
                    style={{
                      borderColor: q.done ? "var(--color-edge)" : domain.color,
                      color: domain.color,
                    }}
                  >
                    {q.done ? "✓" : ""}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm ${
                        q.done ? "text-ink-faint line-through" : "text-ink"
                      }`}
                    >
                      {q.title}
                    </span>
                    {/* Implementation intention: when and where, not just what. */}
                    <span className="mt-0.5 block truncate font-sys text-[10px] text-ink-faint">
                      {q.when} · {q.where}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span
                      className="block font-sys text-[10px] tracking-[0.12em]"
                      style={{ color: domain.color }}
                    >
                      {q.difficulty}
                    </span>
                    {/* Fixed XP, known before you start. */}
                    <span className="tnum block font-sys text-[11px] text-ink-dim">
                      {XP_BY_DIFFICULTY[q.difficulty]} XP
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
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

      {/* ---------------- real-world ledger ---------------- */}
      <Panel label="Real-World Ledger" delay={500} className="mt-3">
        <div className="grid grid-cols-2 gap-px bg-edge/40">
          {LEDGER.map((row) => (
            <div key={row.unit} className="bg-panel px-4 py-3">
              <p className="tnum font-display text-2xl leading-none text-ink">
                {row.value}
              </p>
              <p className="mt-1 text-[11px] text-ink-dim">{row.unit}</p>
              <p className="font-sys text-[10px] text-ink-faint">{row.note}</p>
            </div>
          ))}
        </div>
        <p className="border-t border-edge/60 px-4 py-2.5 font-sys text-[10px] leading-relaxed text-ink-faint">
          This is what actually changed. The level is decoration on top of it.
        </p>
      </Panel>

      <p className="mt-6 text-center font-sys text-[10px] leading-relaxed text-ink-faint">
        PHASE 0 · fake data, no account, nothing saved
        <br />
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

      {/* ---------------- demo trigger ----------------
          Phase 0 only. In the real game a tier-up is earned, never a button. */}
      <button
        onClick={() => {
          initAudio();
          setTierUp({ from: tier, to: Math.min(5, tier + 1) });
        }}
        data-testid="tier-up"
        className="fixed right-4 bottom-4 z-40 border border-edge bg-panel/90 px-3 py-2 font-sys text-[10px] tracking-[0.16em] text-ink-dim backdrop-blur-sm transition-colors hover:border-sys/60 hover:text-sys"
      >
        ▲ TIER UP (demo)
      </button>

      {/* ---------------- overlays ---------------- */}
      {verifying && (
        <VerificationScreen
          quest={verifying}
          onConfirm={() => {
            const q = verifying;
            setVerifying(null);
            award(q);
          }}
          onNotYet={() => {
            setVerifying(null);
            // Choosing NOT YET is rewarded. That inversion is what makes honesty
            // the path of least resistance rather than a rule to obey.
            setIntegrity((i) => i + 4);
            play("deny");
            buzz("tap");
            toast("+4 INTEGRITY", "var(--color-integrity)");
          }}
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
          integrity={integrity}
          onDone={() => {
            setTier(tierUp.to);
            setTierUp(null);
          }}
        />
      )}
    </main>
  );
}
