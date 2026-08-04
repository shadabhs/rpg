"use client";

import { initAudio, play } from "@/lib/sound";

/**
 * The System's module bar. Fixed to the bottom because this is a
 * phone-first app and navigation belongs under the thumb; every target is
 * ≥44px for the same reason.
 *
 * Deliberately not a generic tab bar: modules are named in the System's
 * register, the active one is marked with a lit rule rather than a
 * rounded pill, and a badge only ever shows a REAL count (outstanding
 * quests). Per DESIGN.md, "the interface is the world" — this reads as
 * switching System modules, not browsing an app.
 */
export const VIEWS = ["status", "today", "campaign", "chronicle", "system"] as const;
export type View = (typeof VIEWS)[number];

const LABELS: Record<View, string> = {
  status: "STATUS",
  today: "TODAY",
  campaign: "CAMPAIGN",
  chronicle: "RECORD",
  system: "SYSTEM",
};

export function SystemNav({
  view,
  onChange,
  outstanding,
}: {
  view: View;
  onChange: (v: View) => void;
  /** Outstanding-today count, badged on TODAY. Never a fabricated number. */
  outstanding: number;
}) {
  return (
    <nav
      aria-label="System modules"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-void/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-md">
        {VIEWS.map((v) => {
          const active = v === view;
          return (
            <button
              key={v}
              onClick={() => {
                if (v === view) return;
                initAudio();
                play("tick");
                onChange(v);
              }}
              aria-current={active ? "page" : undefined}
              data-testid={`nav-${v}`}
              className={`relative min-h-14 flex-1 px-1 font-sys text-[9px] tracking-[0.14em] transition-colors ${
                active ? "text-sys-bright" : "text-ink-faint hover:text-ink-dim"
              }`}
            >
              {/* The lit rule marking the active module. */}
              <span
                aria-hidden
                className={`absolute inset-x-2 top-0 h-px transition-opacity ${
                  active ? "bg-sys-bright opacity-100" : "opacity-0"
                }`}
              />
              {LABELS[v]}
              {v === "today" && outstanding > 0 && (
                <span className="tnum ml-1 text-sys">{outstanding}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
