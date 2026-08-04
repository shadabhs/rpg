"use client";

import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import { play } from "@/lib/sound";
import { buzz } from "@/lib/haptics";
import { TIER_NAMES, TIER_V_INTEGRITY_REQUIRED } from "@/lib/engine/rules";

/**
 * The tier transformation.
 *
 * This is the moment Phase 0 exists to test. If it doesn't land as a grey
 * shape, ~40 commissioned illustrations won't save it.
 *
 * Same structure as the level-up: dim, hold, transform. The pause is what
 * makes the change land.
 */
export function TierUpOverlay({
  from,
  to,
  auraColor,
  integrity,
  onDone,
}: {
  from: number;
  to: number;
  auraColor: string;
  integrity: number;
  onDone: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setRevealed(true);
      play("levelUp");
      buzz("levelUp");
    }, 900);
    return () => clearTimeout(t);
  }, []);

  const blockedAtFive = to >= 5 && integrity < TIER_V_INTEGRITY_REQUIRED;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(3,5,10,0.9)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      onClick={revealed ? onDone : undefined}
      role="dialog"
      aria-live="assertive"
    >
      <div className="text-center">
        <p className="font-sys text-[11px] tracking-[0.42em] text-sys">
          {revealed ? `[ TIER ${roman(to)} ]` : "· · ·"}
        </p>

        <div className="mt-6 flex justify-center">
          <Avatar
            tier={revealed ? to : from}
            auraColor={auraColor}
            consistency={0.95}
            flare={revealed}
            size={210}
          />
        </div>

        {revealed && (
          <div className="animate-rise">
            <p
              className="font-display text-3xl tracking-[0.16em] text-sys-bright"
              style={{ textShadow: "0 0 22px rgba(127,212,255,0.45)" }}
            >
              {TIER_NAMES[to - 1]}
            </p>

            {/* Tier V is gated on honesty, not power. The System states the
                requirement and nothing more — it never accuses. */}
            {blockedAtFive ? (
              <p className="mt-5 font-sys text-[11px] leading-relaxed text-integrity">
                [ TIER V ] Requires Integrity {TIER_V_INTEGRITY_REQUIRED}.
                <br />
                Current: {integrity}.
              </p>
            ) : (
              <p className="mt-5 font-sys text-[11px] leading-relaxed text-ink-dim">
                Earned through real action.
                <br />
                Nothing here was given to you.
              </p>
            )}

            <p className="mt-8 font-sys text-[10px] tracking-[0.2em] text-ink-faint">
              TAP TO CONTINUE
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function roman(n: number) {
  return ["I", "II", "III", "IV", "V"][Math.max(0, Math.min(4, n - 1))];
}
