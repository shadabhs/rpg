"use client";

import { useState } from "react";
import { Panel } from "@/components/Panel";
import { useActions } from "@/components/ActionsContext";
import { initAudio, play, setMuted } from "@/lib/sound";
import { useMuted } from "@/lib/hooks";
import { signOut } from "@/app/actions";

/**
 * [ SYSTEM CONFIGURATION ] — per DESIGN.md there is no "Settings" screen;
 * the interface IS the world, so configuration is a System module.
 *
 * Holds the one genuinely destructive control in the product. Reset is
 * deliberately slow: an explicit arming step, then a typed confirmation,
 * with the consequence stated plainly before either. The System does not
 * warn twice or plead — it states what will happen and waits.
 */
export function SystemPanel({
  onReset,
  onRejected,
  delay,
}: {
  onReset: () => void;
  onRejected: (error: string) => void;
  delay?: number;
}) {
  const { resetProgress } = useActions();
  const muted = useMuted();
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const confirmed = typed.trim().toUpperCase() === "RESET";

  function toggleMute() {
    initAudio();
    const next = !muted;
    setMuted(next);
    if (!next) play("panel");
  }

  async function doReset() {
    if (!confirmed || submitting) return;
    setSubmitting(true);
    let result: { ok: boolean; error?: string };
    try {
      result = await resetProgress(typed);
    } catch {
      result = { ok: false, error: "The System could not be reached." };
    }
    setSubmitting(false);
    if (!result.ok) {
      onRejected(result.error ?? "Reset refused.");
      return;
    }
    setArmed(false);
    setTyped("");
    play("deny");
    onReset();
  }

  return (
    <>
      <Panel label="System configuration" delay={delay}>
        <div className="divide-y divide-edge/40">
          <button
            onClick={toggleMute}
            aria-pressed={muted}
            className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-sys/5"
          >
            <span className="font-sys text-[12px] text-ink">Sound and haptics</span>
            <span className="font-sys text-[10px] tracking-[0.16em] text-sys">
              {muted ? "OFF" : "ON"}
            </span>
          </button>

          <form action={signOut}>
            <button
              type="submit"
              className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-sys/5"
            >
              <span className="font-sys text-[12px] text-ink">End session</span>
              <span className="font-sys text-[10px] tracking-[0.16em] text-ink-dim">
                SIGN OUT
              </span>
            </button>
          </form>
        </div>
      </Panel>

      <Panel label="Begin again" delay={(delay ?? 0) + 90} className="mt-3" tone="warn">
        <div className="px-4 py-4">
          <p className="font-sys text-[12px] leading-relaxed text-ink-dim">
            Clears your level, XP, domains, gold, titles and quests, and
            returns you to an unnamed subject at Level 1.
          </p>
          <p className="mt-3 font-sys text-[11px] leading-relaxed text-ink-faint">
            Integrity resets with everything else. The record itself is never
            deleted — the System keeps what happened and simply begins
            counting again.
          </p>

          {!armed ? (
            <button
              onClick={() => setArmed(true)}
              data-testid="reset-arm"
              className="mt-4 min-h-11 w-full border border-rust/50 px-4 font-sys text-[11px] tracking-[0.2em] text-rust transition-colors hover:bg-rust/10"
            >
              RESET ALL PROGRESS
            </button>
          ) : (
            <div className="animate-rise mt-4">
              <label className="block">
                <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
                  TYPE RESET TO CONFIRM
                </span>
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="RESET"
                  data-testid="reset-input"
                  className="mt-2 w-full border-b border-edge bg-transparent pb-1.5 text-center font-display text-lg tracking-[0.3em] text-ink placeholder:text-ink-faint focus:border-rust focus:outline-none"
                />
              </label>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    setArmed(false);
                    setTyped("");
                  }}
                  className="min-h-11 border border-edge font-sys text-[11px] tracking-[0.16em] text-ink-dim transition-colors hover:border-sys/50"
                >
                  KEEP IT
                </button>
                <button
                  onClick={doReset}
                  disabled={!confirmed || submitting}
                  data-testid="reset-confirm"
                  className="min-h-11 border border-rust/60 bg-rust/10 font-sys text-[11px] tracking-[0.16em] text-rust transition-colors hover:bg-rust/20 disabled:opacity-30"
                >
                  {submitting ? "…" : "ERASE"}
                </button>
              </div>
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}
