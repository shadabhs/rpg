"use client";

import { CountUp } from "./CountUp";
import type { Domain } from "@/lib/data";

/**
 * A domain bar. Always shows proximity, never raw totals — the goal
 * gradient is the point. Bars overshoot and settle, with a leading edge
 * of light.
 *
 * Trend is shown because the character sheet is meant to be an honest
 * X-ray of where effort actually goes. A negative trend is stated plainly,
 * never dressed up.
 */
export function StatBar({ domain, max = 60 }: { domain: Domain; max?: number }) {
  const pct = Math.min(100, (domain.value / max) * 100);

  return (
    <div className="group py-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span
            className="font-sys text-[11px] tracking-[0.18em]"
            style={{ color: domain.color }}
          >
            {domain.label}
          </span>
          <span className="hidden text-[10px] text-ink-faint sm:inline">
            {domain.covers}
          </span>
        </div>
        <div className="flex items-baseline gap-2 font-sys">
          <CountUp value={domain.value} className="text-sm text-ink" />
          <span
            className={`text-[10px] tnum ${
              domain.trend >= 0 ? "text-ink-dim" : "text-rust"
            }`}
          >
            {domain.trend >= 0 ? `+${domain.trend}` : domain.trend}
          </span>
        </div>
      </div>

      <div className="relative h-1.5 overflow-hidden bg-void-2 ring-1 ring-edge/60">
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${domain.color}44, ${domain.color})`,
            // Subtle back-out: the fill runs slightly past, then settles.
            transition: "width 820ms cubic-bezier(0.22, 1.4, 0.36, 1)",
          }}
        />
        {/* leading edge of light */}
        <div
          className="absolute inset-y-0 w-[2px]"
          style={{
            left: `calc(${pct}% - 1px)`,
            background: domain.color,
            boxShadow: `0 0 8px 2px ${domain.color}`,
            transition: "left 820ms cubic-bezier(0.22, 1.4, 0.36, 1)",
          }}
        />
      </div>
    </div>
  );
}
