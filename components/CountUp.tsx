"use client";

import { useEffect, useRef, useState } from "react";
import { play } from "@/lib/sound";
import { useReducedMotion } from "@/lib/hooks";

/**
 * Numbers never jump. XP counts up with easing — the highest
 * value-per-effort animation in the product.
 *
 * Ticks are played sparsely (not per frame) so the sound reads as a
 * mechanical counter rather than a buzz.
 */
export function CountUp({
  value,
  duration = 900,
  className = "",
  tick = false,
}: {
  value: number;
  duration?: number;
  className?: string;
  tick?: boolean;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      from.current = value;
      return;
    }

    const start = from.current;
    const delta = value - start;
    if (delta === 0) return;

    const t0 = performance.now();
    let lastTick = 0;

    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      // Decisive ease-out — fast off the mark, settles precisely.
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + delta * eased));

      if (tick && now - lastTick > 55 && p < 0.92) {
        lastTick = now;
        play("tick");
      }

      if (p < 1) {
        raf.current = requestAnimationFrame(frame);
      } else {
        from.current = value;
      }
    };

    raf.current = requestAnimationFrame(frame);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      from.current = value;
    };
  }, [value, duration, tick, reduced]);

  // With reduced motion the value is rendered directly — no animation, and
  // no state write from an effect.
  const shown = reduced ? value : display;

  return <span className={`tnum ${className}`}>{shown.toLocaleString()}</span>;
}
