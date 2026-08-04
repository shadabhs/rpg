"use client";

import { useEffect, useState } from "react";
import { play } from "@/lib/sound";
import { buzz } from "@/lib/haptics";
import type { QuestRow } from "@/db/mappers";

/**
 * The Verification Screen.
 *
 * Full-screen, weighty, unhurried — this is where the honesty system either
 * works or reads as nagging. Phase 0 exists partly to find out which.
 *
 * Friction is scaled to stakes: dailies never see this. Only milestones,
 * level-ups and epic completions do.
 *
 * Note the framing: the System never accuses. It states plainly that it
 * cannot check, and that the only real loss is claiming something untrue.
 * Choosing NOT YET is rewarded — that inversion is what makes honesty the
 * path of least resistance rather than a rule to obey.
 */
export function VerificationScreen({
  quest,
  onConfirm,
  onNotYet,
}: {
  quest: QuestRow;
  onConfirm: (evidence: string) => void;
  onNotYet: () => void;
}) {
  const [evidence, setEvidence] = useState("");

  useEffect(() => {
    play("verify");
    buzz("weight");
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-5 py-8"
      style={{ background: "rgba(3,5,10,0.92)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
      role="dialog"
      aria-modal="true"
    >
      <div className="animate-rise w-full max-w-sm">
        <p className="font-sys text-[11px] tracking-[0.42em] text-integrity">
          [ VERIFICATION ]
        </p>

        <div className="mt-7 border-l-2 border-integrity/40 pl-4">
          <p className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
            YOU ARE CLAIMING
          </p>
          <p className="mt-1.5 font-display text-xl leading-snug text-ink">
            {quest.title.replace(/^MILESTONE — /, "")}
          </p>
        </div>

        <div className="mt-5 border-l-2 border-edge pl-4">
          <p className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
            THIS GRANTS
          </p>
          <p className="mt-1.5 font-sys text-sm text-sys-bright">{quest.grants}</p>
        </div>

        <p className="mt-8 font-sys text-[13px] leading-relaxed text-ink-dim">
          The System cannot check this.
          <br />
          Only you can.
        </p>

        <label className="mt-6 block">
          <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
            WHAT IS THE EVIDENCE?
          </span>
          <input
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="a link, a number, a note"
            className="mt-2 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
          />
        </label>

        {/* Stated once, plainly, without accusation. */}
        <p className="mt-8 font-sys text-[12px] leading-relaxed text-ink-dim">
          If you have not done this, claiming it is not an exploit.
          <br />
          <span className="text-integrity">
            It is the only way to actually lose.
          </span>
        </p>

        <div className="mt-8 grid gap-2.5">
          <button
            onClick={() => onConfirm(evidence)}
            className="border border-sys/60 bg-sys/10 py-3.5 font-sys text-[11px] tracking-[0.24em] text-sys-bright transition-colors hover:bg-sys/20 active:bg-sys/30"
          >
            I HAVE DONE THIS
          </button>
          <button
            onClick={onNotYet}
            className="border border-edge py-3.5 font-sys text-[11px] tracking-[0.24em] text-ink-dim transition-colors hover:border-integrity/50 hover:text-integrity"
          >
            NOT YET
          </button>
        </div>
      </div>
    </div>
  );
}
