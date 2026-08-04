"use client";

import { useEffect, useState } from "react";
import { play } from "@/lib/sound";
import { buzz } from "@/lib/haptics";
import type { QuestRow } from "@/db/mappers";
import type { RequisiteReport } from "@/lib/engine/requisites";

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
  epic,
  requisites,
  onConfirm,
  onNotYet,
}: {
  quest: QuestRow;
  /** The epic this milestone belongs to, if any. Its intent — the
   *  player's own words for why the thing matters — is what makes
   *  claiming a chapter weigh something. */
  epic?: { title: string; intent: string | null } | null;
  /** Preparation on file. Never blocks the claim — see DESIGN.md
   *  "Requisites": the System cannot see your life and must not assert
   *  authority over it. It states the shortfall and lets you proceed. */
  requisites?: RequisiteReport;
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
          {epic && (
            <p className="mb-1.5 truncate font-sys text-[10px] tracking-[0.2em] text-sys-dim">
              {epic.title.toUpperCase()}
            </p>
          )}
          <p className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
            YOU ARE CLAIMING
          </p>
          <p className="mt-1.5 font-display text-xl leading-snug text-ink">
            {quest.title.replace(/^MILESTONE — /, "")}
          </p>
        </div>

        {epic?.intent && (
          <div className="mt-5 border-l-2 border-edge pl-4">
            <p className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
              YOU SAID THIS MATTERED BECAUSE
            </p>
            <p className="mt-1.5 font-sys text-sm leading-relaxed text-ink-dim">
              {epic.intent}
            </p>
          </div>
        )}

        {quest.grants && (
          <div className="mt-5 border-l-2 border-edge pl-4">
            <p className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
              THIS GRANTS
            </p>
            <p className="mt-1.5 font-sys text-sm text-sys-bright">{quest.grants}</p>
          </div>
        )}

        {/* Preparation on file. Stated as a shortfall with exact numbers —
            never a bare "locked", because proximity is the honest form of
            a gate. It does not disable anything below it. */}
        {requisites && requisites.statuses.length > 0 && (
          <div
            className={`mt-5 border-l-2 pl-4 ${
              requisites.met ? "border-integrity/40" : "border-rust/50"
            }`}
            data-testid="requisites"
          >
            <p className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
              {requisites.met ? "PREPARATION — MET" : "[ LOCKED ] PREPARATION"}
            </p>
            <ul className="mt-1.5 space-y-1">
              {requisites.statuses.map((s, i) => (
                <li
                  key={i}
                  className={`font-sys text-[12px] leading-relaxed ${
                    s.met ? "text-ink-dim" : "text-rust"
                  }`}
                >
                  {s.met ? "· " : "× "}
                  {s.text}
                </li>
              ))}
            </ul>
          </div>
        )}

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

        {/* The honest override. A locked milestone stays claimable and pays
            in full — nothing about being "unready" makes a real deed less
            real. Only the wording changes, so the record can be accurate. */}
        {requisites && !requisites.met && (
          <p className="mt-6 font-sys text-[12px] leading-relaxed text-ink-faint">
            Nothing here prevents you claiming this. If you have done it, say
            so — it pays the same. The record will simply note that the
            preparation above was not on file.
          </p>
        )}

        <div className="mt-8 grid gap-2.5">
          <button
            onClick={() => onConfirm(evidence)}
            data-testid="confirm-claim"
            className="border border-sys/60 bg-sys/10 py-3.5 font-sys text-[11px] tracking-[0.24em] text-sys-bright transition-colors hover:bg-sys/20 active:bg-sys/30"
          >
            {requisites && !requisites.met ? "I DID IT ANYWAY" : "I HAVE DONE THIS"}
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
