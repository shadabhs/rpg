"use client";

import { useState } from "react";
import { setCharacterName } from "@/app/actions";
import { initAudio, play } from "@/lib/sound";
import { buzz } from "@/lib/haptics";

/**
 * The first-run rite. Until the AI Induction interview exists, this is
 * the identity beat: state your name, take the Oath, hear the System's
 * cold opening statement. Per DESIGN.md's "you are somebody specific,
 * mid-situation" — even day one should not feel like a generic account.
 *
 * The System states facts. It does not welcome, and it does not promise.
 */
export function FirstRunRite({
  onNamed,
  onDone,
}: {
  onNamed: (name: string) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"name" | "oath" | "statement">("name");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    initAudio();
    setSubmitting(true);
    setError("");
    const result = await setCharacterName(name);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onNamed(name.trim().toUpperCase());
    play("panel");
    setStep("oath");
  }

  function takeOath() {
    initAudio();
    play("verify");
    buzz("weight");
    setStep("statement");
  }

  function close() {
    play("complete");
    onDone();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-5 py-8"
      style={{
        background: "rgba(3,5,10,0.96)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
      role="dialog"
      aria-modal="true"
      data-testid="first-run-rite"
    >
      <div className="animate-rise w-full max-w-sm">
        {step === "name" && (
          <>
            <p className="font-sys text-[11px] tracking-[0.42em] text-sys">
              [ INDUCTION ]
            </p>
            <p className="mt-6 font-sys text-[13px] leading-relaxed text-ink-dim">
              The System has no record of you.
              <br />
              State the name your character will carry.
            </p>
            <form onSubmit={submitName} className="mt-6">
              <input
                autoFocus
                required
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="NAME"
                data-testid="rite-name"
                className="w-full border-b border-edge bg-transparent pb-2 text-center font-display text-2xl tracking-[0.12em] text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
              />
              {error && (
                <p className="mt-3 font-sys text-[11px] text-rust">
                  [ REJECTED ] {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="mt-7 w-full border border-sys/60 bg-sys/10 py-3.5 font-sys text-[11px] tracking-[0.24em] text-sys-bright transition-colors hover:bg-sys/20 disabled:opacity-40"
              >
                {submitting ? "…" : "RECORD IT"}
              </button>
            </form>
          </>
        )}

        {step === "oath" && (
          <>
            <p className="font-sys text-[11px] tracking-[0.42em] text-integrity">
              [ THE OATH ]
            </p>
            <p className="mt-8 border-l-2 border-integrity/40 pl-4 font-display text-xl leading-relaxed text-ink">
              I will not claim
              <br />
              what I have not done.
            </p>
            <p className="mt-6 font-sys text-[12px] leading-relaxed text-ink-dim">
              The System cannot see your life. It can only keep your record —
              and the record is only worth what it costs you to keep it true.
            </p>
            <button
              onClick={takeOath}
              data-testid="rite-oath"
              className="mt-8 w-full border border-integrity/50 bg-integrity/5 py-3.5 font-sys text-[11px] tracking-[0.24em] text-integrity transition-colors hover:bg-integrity/10"
            >
              I SO SWEAR
            </button>
          </>
        )}

        {step === "statement" && (
          <>
            <p className="font-sys text-[11px] tracking-[0.42em] text-sys">
              [ RECORDED ]
            </p>
            <p className="mt-8 font-sys text-[13px] leading-loose text-ink-dim">
              Level 1. Every domain at zero.
              <br />
              Nothing is known about you yet.
              <br />
              <span className="text-ink">That is accurate.</span>
            </p>
            <p className="mt-6 font-sys text-[12px] leading-relaxed text-ink-faint">
              The window is open. What it shows next is up to you.
            </p>
            <button
              onClick={close}
              data-testid="rite-close"
              className="mt-8 w-full border border-sys/60 bg-sys/10 py-3.5 font-sys text-[11px] tracking-[0.24em] text-sys-bright transition-colors hover:bg-sys/20"
            >
              BEGIN
            </button>
          </>
        )}
      </div>
    </div>
  );
}
