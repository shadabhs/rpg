"use client";

import { useState } from "react";
import { Panel } from "@/components/Panel";
import type { ChronicleEntry, Ledger } from "@/lib/engine/chronicle";

/**
 * The Real-World Ledger and the Chronicle — the System's memory made
 * visible. The Ledger leads, per DESIGN.md: totals of real things are
 * the headline, levels are decoration on truth. Below it, the
 * append-only log rendered as journal lines. Nothing here is stored;
 * both are derived from events on every render, same as the character.
 */
export function ChroniclePanel({
  ledger,
  entries,
  delay,
}: {
  ledger: Ledger;
  entries: ChronicleEntry[];
  delay?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entries : entries.slice(0, 8);
  const hidden = entries.length - visible.length;

  const stats: Array<[number, string]> = [
    [ledger.daysActive, ledger.daysActive === 1 ? "day active" : "days active"],
    [
      ledger.questsCompleted,
      ledger.questsCompleted === 1 ? "quest done" : "quests done",
    ],
    [
      ledger.milestonesClaimed,
      ledger.milestonesClaimed === 1 ? "milestone claimed" : "milestones claimed",
    ],
    [ledger.timesHeldBack, "held back"],
  ];

  return (
    <Panel label="Chronicle" delay={delay} className="mt-3">
      {/* The Ledger. Real totals of real things — no XP, no levels. */}
      <div
        className="grid grid-cols-4 gap-2 border-b border-edge/40 px-4 py-3"
        data-testid="ledger"
      >
        {stats.map(([value, label]) => (
          <div key={label} className="text-center">
            <p className="tnum font-display text-xl leading-none text-ink">
              {value}
            </p>
            <p className="mt-1 font-sys text-[9px] leading-tight tracking-[0.08em] text-ink-faint">
              {label.toUpperCase()}
            </p>
          </div>
        ))}
      </div>

      {entries.length > 0 ? (
        <ul data-testid="chronicle-entries">
          {visible.map((e) => (
            <li
              key={e.id}
              className="flex items-baseline gap-2.5 border-b border-edge/30 px-4 py-2 last:border-b-0"
            >
              <span className="tnum shrink-0 font-sys text-[9px] text-ink-faint">
                {e.day.slice(5)}
              </span>
              <span className="shrink-0 font-sys text-[10px] tracking-[0.08em] text-sys-dim">
                {e.tag}
              </span>
              <span className="min-w-0 flex-1 truncate font-sys text-[11px] text-ink-dim">
                {e.text}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-5 text-center font-sys text-[12px] leading-relaxed text-ink-dim">
          Nothing on record.
          <br />
          The Chronicle writes itself from what you do.
        </p>
      )}

      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full border-t border-edge/40 px-4 py-2.5 font-sys text-[10px] tracking-[0.16em] text-ink-faint transition-colors hover:text-sys"
        >
          {hidden} EARLIER {hidden === 1 ? "ENTRY" : "ENTRIES"}
        </button>
      )}
      {expanded && entries.length > 8 && (
        <button
          onClick={() => setExpanded(false)}
          className="w-full border-t border-edge/40 px-4 py-2.5 font-sys text-[10px] tracking-[0.16em] text-ink-faint transition-colors hover:text-sys"
        >
          COLLAPSE
        </button>
      )}
    </Panel>
  );
}
