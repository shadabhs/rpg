"use client";

import { useEffect, useState } from "react";
import { play } from "@/lib/sound";
import { buzz } from "@/lib/haptics";

type Stage = "dim" | "hold" | "reveal";

/**
 * The level-up.
 *
 * The critical detail from DESIGN.md: it holds a beat of silence first.
 * Screen dims, everything stops, THEN the number changes. The pause before
 * the payoff is the payoff — most apps fire the confetti instantly and it
 * lands flat.
 *
 * Sound and haptics fire on reveal, not on trigger.
 */
export function LevelUpOverlay({
  from,
  to,
  onDone,
}: {
  from: number;
  to: number;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<Stage>("dim");

  useEffect(() => {
    // 1. Dim and stop. 2. Silence. 3. Reveal.
    const a = setTimeout(() => setStage("hold"), 260);
    const b = setTimeout(() => {
      setStage("reveal");
      play("levelUp");
      buzz("levelUp");
    }, 1050);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{
        background: "rgba(3,5,10,0.9)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        transition: "opacity 240ms",
      }}
      onClick={stage === "reveal" ? onDone : undefined}
      role="dialog"
      aria-live="assertive"
    >
      <div className="w-full max-w-sm text-center">
        {stage !== "reveal" ? (
          // The silence. Deliberately almost nothing on screen.
          <p className="font-sys text-[11px] tracking-[0.4em] text-sys-dim">
            {stage === "dim" ? "" : "· · ·"}
          </p>
        ) : (
          <div className="animate-shake">
            <p className="font-sys text-[11px] tracking-[0.42em] text-sys">
              [ LEVEL UP ]
            </p>

            <div className="mt-6 flex items-center justify-center gap-5">
              <span className="tnum font-display text-5xl leading-none font-semibold text-ink-faint">
                {from}
              </span>
              <span className="text-ink-faint">→</span>
              <span
                className="tnum font-display text-7xl leading-none font-bold text-sys-bright"
                style={{ textShadow: "0 0 26px rgba(127,212,255,0.55)" }}
              >
                {to}
              </span>
            </div>

            {/* Reality, not encouragement. The System supplies the mirror. */}
            <p className="mt-7 font-sys text-[11px] leading-relaxed text-ink-dim">
              You have trained 34 times this season.
              <br />
              Last season you trained 11.
            </p>

            <p className="mt-8 font-sys text-[10px] tracking-[0.2em] text-ink-faint">
              TAP TO CONTINUE
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
