"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/hooks";
import { play } from "@/lib/sound";
import { buzz } from "@/lib/haptics";

/**
 * A broken personal record. Same "beat of silence before the reveal"
 * sequencing as the level-up, at lower intensity — this is a smaller
 * moment than a level, but it's the one that makes yesterday matter.
 *
 * Tone per AGENTS.md: it states the fact and the number it beat. No
 * exclamation, no praise, no "you're on fire". `previous: 0` reads as
 * "no previous record" rather than a fabricated comparison.
 */
export function RecordOverlay({
  quest,
  streak,
  previous,
  onDone,
}: {
  quest: string;
  streak: number;
  previous: number;
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const [revealed, setRevealed] = useState(reduced);

  useEffect(() => {
    play("levelUp");
    buzz("levelUp");
    if (reduced) {
      const t = setTimeout(onDone, 2200);
      return () => clearTimeout(t);
    }
    const hold = setTimeout(() => setRevealed(true), 420);
    const close = setTimeout(onDone, 3400);
    return () => {
      clearTimeout(hold);
      clearTimeout(close);
    };
  }, [reduced, onDone]);

  return (
    <div
      role="status"
      data-testid="record-overlay"
      onClick={onDone}
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 px-6"
      style={{ backdropFilter: "blur(6px)" }}
    >
      <div className="w-full max-w-sm border border-integrity/40 bg-panel/90 px-6 py-8 text-center">
        <p className="font-sys text-[11px] tracking-[0.32em] text-integrity">
          [ RECORD ]
        </p>

        {revealed && (
          <div className="animate-rise">
            <p className="mt-5 font-display text-4xl leading-none text-integrity">
              <span className="tnum">{streak}</span>
              <span className="ml-2 font-sys text-base tracking-[0.16em]">DAYS</span>
            </p>
            <p className="mt-4 font-sys text-[12px] leading-relaxed text-ink-dim">
              {quest}
            </p>
            <p className="mt-3 font-sys text-[11px] leading-relaxed text-ink-faint">
              {previous > 0
                ? `Your previous best was ${previous}.`
                : "You have not done this before."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
