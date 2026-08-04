"use client";

import { useEffect, useRef, useState } from "react";
import { inductionTurn, inductionComplete } from "@/app/actions";
import { initAudio, play } from "@/lib/sound";
import { buzz } from "@/lib/haptics";
import { DictateButton } from "@/components/DictateButton";

/**
 * The Induction interview. The System asks; you answer; it proposes a
 * starting structure and states your situation back to you.
 *
 * Degrades honestly: if no interviewer is connected or the provider
 * fails, it says so plainly and offers the scripted path instead. It
 * never pretends an AI is present when it isn't, and it never blocks
 * someone from starting.
 */
type Turn = { role: "user" | "assistant"; content: string };

export function Induction({
  onSkip,
  onDone,
}: {
  onSkip: () => void;
  onDone: (statement: string) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, busy]);

  async function send(history: Turn[]) {
    setBusy(true);
    setError(null);
    let res;
    try {
      res = await inductionTurn(history);
    } catch {
      res = { ok: false as const, error: "The interviewer could not be reached." };
    }
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    play("panel");
    setTurns([...history, { role: "assistant", content: res.text }]);
    if (res.ready) setReady(true);
  }

  async function begin() {
    initAudio();
    setStarted(true);
    await send([
      { role: "user", content: "Begin the induction." },
    ]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: draft.trim() }];
    setTurns(next);
    setDraft("");
    await send(next);
  }

  async function finish() {
    setBusy(true);
    setError(null);
    let res;
    try {
      res = await inductionComplete(turns);
    } catch {
      res = { ok: false as const, error: "The interviewer could not be reached." };
    }
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    play("levelUp");
    buzz("weight");
    onDone(res.statement ?? "");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col px-5 py-6"
      style={{ background: "rgba(3,5,10,0.97)", backdropFilter: "blur(14px)" }}
      role="dialog"
      aria-modal="true"
      data-testid="induction"
    >
      <p className="shrink-0 font-sys text-[11px] tracking-[0.42em] text-sys">
        [ INDUCTION ]
      </p>

      {!started ? (
        <div className="animate-rise mt-8 flex-1">
          <p className="font-sys text-[13px] leading-relaxed text-ink-dim">
            This takes about ten minutes. It matters that you answer honestly —
            the System builds your character from what you say, and it cannot
            check any of it.
          </p>
          <p className="mt-4 font-sys text-[12px] leading-relaxed text-ink-faint">
            What you type is used to derive your starting structure and is then
            discarded. The conversation is never stored.
          </p>
          <p className="mt-4 font-sys text-[12px] leading-relaxed text-ink-faint">
            No answer here grants progress. You will begin at Level 1 with every
            domain at zero, exactly like someone who skipped this.
          </p>
          <div className="mt-8 grid gap-2.5">
            <button
              onClick={begin}
              data-testid="induction-begin"
              className="min-h-12 border border-sys/60 bg-sys/10 font-sys text-[11px] tracking-[0.24em] text-sys-bright"
            >
              BEGIN
            </button>
            <button
              onClick={onSkip}
              data-testid="induction-skip"
              className="min-h-12 border border-edge font-sys text-[11px] tracking-[0.24em] text-ink-dim"
            >
              NOT NOW
            </button>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="mt-5 flex-1 overflow-y-auto">
            {turns
              .filter((t) => t.content !== "Begin the induction.")
              .map((t, i) => (
                <div key={i} className="mb-4">
                  {t.role === "assistant" ? (
                    <p className="border-l-2 border-sys/40 pl-3 font-sys text-[13px] leading-relaxed text-ink">
                      {t.content}
                    </p>
                  ) : (
                    <p className="pl-3 text-right font-sys text-[12px] leading-relaxed text-ink-dim">
                      {t.content}
                    </p>
                  )}
                </div>
              ))}
            {busy && (
              <p className="border-l-2 border-edge pl-3 font-sys text-[12px] text-ink-faint">
                …
              </p>
            )}
          </div>

          {error && (
            <div className="shrink-0 border border-rust/40 bg-rust/5 px-3 py-2">
              <p className="font-sys text-[11px] text-rust">[ REJECTED ] {error}</p>
              <button
                onClick={onSkip}
                className="mt-2 min-h-11 w-full border border-edge font-sys text-[10px] tracking-[0.16em] text-ink-dim"
              >
                PROCEED WITHOUT THE INTERVIEW
              </button>
            </div>
          )}

          {ready ? (
            <button
              onClick={finish}
              disabled={busy}
              data-testid="induction-finish"
              className="mt-3 min-h-12 shrink-0 border border-integrity/50 bg-integrity/5 font-sys text-[11px] tracking-[0.24em] text-integrity disabled:opacity-40"
            >
              {busy ? "…" : "RECORD MY CHARACTER"}
            </button>
          ) : (
            <form onSubmit={submit} className="mt-3 shrink-0">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={busy}
                autoFocus
                placeholder="Answer plainly."
                data-testid="induction-input"
                className="w-full border-b border-edge bg-transparent pb-2 font-sys text-sm text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
              />

              {/* Speaking is far faster than typing a real answer, and
                  these answers are the whole point of the interview. */}
              <DictateButton
                value={draft}
                onChange={setDraft}
                label="Dictate your answer"
              />

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={onSkip}
                  className="min-h-11 border border-edge font-sys text-[10px] tracking-[0.14em] text-ink-faint"
                >
                  STOP
                </button>
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  className="col-span-2 min-h-11 border border-sys/60 bg-sys/10 font-sys text-[10px] tracking-[0.16em] text-sys-bright disabled:opacity-40"
                >
                  ANSWER
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
