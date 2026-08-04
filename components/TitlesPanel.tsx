"use client";

import { useState } from "react";
import { Panel } from "@/components/Panel";
import { TITLE_DEFS, DEFAULT_TITLE } from "@/lib/engine/titles";
import type { CharacterState } from "@/lib/engine/reducer";
import type { SystemEvent } from "@/lib/engine/events";
import { chooseTitle } from "@/app/actions";
import { initAudio, play } from "@/lib/sound";

/**
 * Earned nouns. Every title is cosmetic and deterministic; locked
 * hidden ones show only ??? — earning one should be a discovery, not a
 * checklist. Level-gated ones show their requirement while locked:
 * visible proximity is the goal gradient.
 */
export function TitlesPanel({
  state,
  events,
  currentTitle,
  onTitleChosen,
  onRejected,
  delay,
}: {
  state: CharacterState;
  events: SystemEvent[];
  currentTitle: string;
  onTitleChosen: (title: string) => void;
  onRejected: (error: string) => void;
  delay?: number;
}) {
  const [busy, setBusy] = useState(false);
  const earned = TITLE_DEFS.filter((t) => t.earned(state, events));
  const earnedNames = new Set(earned.map((t) => t.name));

  async function wear(name: string) {
    if (busy || name === currentTitle) return;
    initAudio();
    const previous = currentTitle;
    onTitleChosen(name); // optimistic — reverted on rejection
    play("tick");
    setBusy(true);
    const result = await chooseTitle(name);
    setBusy(false);
    if (!result.ok) {
      onTitleChosen(previous);
      onRejected(result.error);
    }
  }

  return (
    <Panel
      label={`Titles · ${earned.length}/${TITLE_DEFS.length} earned`}
      delay={delay}
      className="mt-3"
    >
      <ul data-testid="titles">
        <li className="border-b border-edge/30 last:border-b-0">
          <button
            onClick={() => wear(DEFAULT_TITLE)}
            disabled={busy}
            className="flex w-full items-baseline gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-sys/5"
          >
            <span
              className={`min-w-0 flex-1 truncate text-sm ${
                currentTitle === DEFAULT_TITLE ? "text-sys-bright" : "text-ink"
              }`}
            >
              {DEFAULT_TITLE}
            </span>
            <span className="shrink-0 font-sys text-[9px] tracking-[0.14em] text-ink-faint">
              {currentTitle === DEFAULT_TITLE ? "WORN" : "ASSIGNED"}
            </span>
          </button>
        </li>

        {TITLE_DEFS.map((t) => {
          const isEarned = earnedNames.has(t.name);
          const worn = currentTitle === t.name;
          return (
            <li key={t.key} className="border-b border-edge/30 last:border-b-0">
              {isEarned ? (
                <button
                  onClick={() => wear(t.name)}
                  disabled={busy}
                  data-testid={`title-${t.key}`}
                  className="w-full px-4 py-2.5 text-left transition-colors hover:bg-sys/5"
                >
                  <span className="flex items-baseline gap-2.5">
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        worn ? "text-sys-bright" : "text-ink"
                      }`}
                    >
                      {t.name}
                    </span>
                    <span className="shrink-0 font-sys text-[9px] tracking-[0.14em] text-integrity">
                      {worn ? "WORN" : "EARNED"}
                    </span>
                  </span>
                  <span className="mt-0.5 block font-sys text-[10px] text-ink-faint">
                    {t.earnedText}
                  </span>
                </button>
              ) : (
                <div className="flex items-baseline gap-2.5 px-4 py-2.5 opacity-60">
                  <span className="min-w-0 flex-1 font-sys text-sm tracking-[0.3em] text-ink-faint">
                    ???
                  </span>
                  <span className="shrink-0 font-sys text-[9px] tracking-[0.14em] text-ink-faint">
                    {t.kind === "level" ? `LEVEL ${t.level}` : "SEALED"}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
