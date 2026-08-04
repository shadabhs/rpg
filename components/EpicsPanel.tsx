"use client";

import { useState } from "react";
import { Panel } from "@/components/Panel";
import { DOMAIN_KEYS, DOMAIN_DISPLAY, type DomainKey } from "@/lib/engine/domains";
import type { EpicRow, QuestRow } from "@/db/mappers";
import { useActions } from "@/components/ActionsContext";

/**
 * The campaign layer. An epic is a named long-term goal; its milestones
 * are the weighty quests inside it, and its progress is DERIVED by
 * counting them — never stored, same discipline as the character sheet.
 *
 * An epic grants nothing by existing. Declaring a goal is not an
 * achievement; only the real actions inside it move a number.
 */
export function EpicsPanel({
  epics,
  quests,
  onCreated,
  onChanged,
  onRejected,
  delay,
}: {
  epics: EpicRow[];
  quests: QuestRow[];
  onCreated: (epic: EpicRow) => void;
  /** Applied optimistically; null status means "abandoned, drop it". */
  onChanged: (epic: EpicRow) => void;
  onRejected: (error: string) => void;
  delay?: number;
}) {
  const { updateEpic, abandonEpic } = useActions();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftIntent, setDraftIntent] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveEdit(epic: EpicRow) {
    if (!draftTitle.trim() || busy) return;
    setBusy(true);
    let res;
    try {
      res = await updateEpic(epic.id, { title: draftTitle, intent: draftIntent });
    } catch {
      res = { ok: false as const, error: "The System could not be reached." };
    }
    setBusy(false);
    if (!res.ok) return onRejected(res.error);
    onChanged({ ...epic, title: draftTitle.trim(), intent: draftIntent.trim() || null });
    setEditing(null);
  }

  async function abandon(epic: EpicRow) {
    if (busy) return;
    setBusy(true);
    let res;
    try {
      res = await abandonEpic(epic.id);
    } catch {
      res = { ok: false as const, error: "The System could not be reached." };
    }
    setBusy(false);
    if (!res.ok) return onRejected(res.error);
    onChanged({ ...epic, status: "abandoned" });
    setEditing(null);
  }
  const active = epics.filter((e) => e.status !== "abandoned");

  return (
    <Panel label={`Epics · ${active.length}`} delay={delay} className="mt-3">
      {active.length > 0 ? (
        <ul>
          {active.map((epic) => {
            const mine = quests.filter((q) => q.epic_id === epic.id);
            const milestones = mine.filter((q) => q.weighty);
            const done = milestones.filter((q) => q.status === "completed").length;
            const pct = milestones.length
              ? Math.round((done / milestones.length) * 100)
              : 0;
            const color = DOMAIN_DISPLAY[epic.domain].color;
            // The next milestone still outstanding — the chapter you're in.
            const next = milestones.find((q) => q.status === "active");

            return (
              <li
                key={epic.id}
                data-testid={`epic-${epic.id}`}
                className="border-b border-edge/40 px-4 py-3 last:border-b-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {epic.title}
                  </span>
                  <span
                    className="tnum shrink-0 font-sys text-[10px] tracking-[0.12em]"
                    style={{ color }}
                  >
                    {milestones.length > 0
                      ? `${done}/${milestones.length}`
                      : "NO MILESTONES"}
                  </span>
                </div>

                {epic.intent && (
                  <p className="mt-1 truncate font-sys text-[10px] text-ink-faint">
                    {epic.intent}
                  </p>
                )}

                {milestones.length > 0 && (
                  <>
                    <div className="relative mt-2 h-1 overflow-hidden bg-void-2 ring-1 ring-edge/60">
                      <div
                        className="absolute inset-y-0 left-0"
                        style={{
                          width: `${pct}%`,
                          background: color,
                          transition: "width 820ms cubic-bezier(0.22, 1.4, 0.36, 1)",
                        }}
                      />
                    </div>
                    {next && (
                      <p className="mt-1.5 font-sys text-[10px] text-ink-dim">
                        NEXT · {next.title}
                      </p>
                    )}
                  </>
                )}

                {editing === epic.id ? (
                  <div className="animate-rise mt-3 border-t border-edge/40 pt-3">
                    <input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      data-testid={`epic-edit-title-${epic.id}`}
                      className="w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink focus:border-sys focus:outline-none"
                    />
                    <input
                      value={draftIntent}
                      onChange={(e) => setDraftIntent(e.target.value)}
                      placeholder="Why this matters"
                      data-testid={`epic-edit-intent-${epic.id}`}
                      className="mt-2 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-[12px] text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
                    />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setEditing(null)}
                        className="min-h-11 border border-edge font-sys text-[10px] tracking-[0.14em] text-ink-dim"
                      >
                        CANCEL
                      </button>
                      <button
                        onClick={() => abandon(epic)}
                        disabled={busy}
                        data-testid={`epic-abandon-${epic.id}`}
                        className="min-h-11 border border-rust/50 font-sys text-[10px] tracking-[0.14em] text-rust disabled:opacity-40"
                      >
                        ABANDON
                      </button>
                      <button
                        onClick={() => saveEdit(epic)}
                        disabled={busy || !draftTitle.trim()}
                        data-testid={`epic-save-${epic.id}`}
                        className="min-h-11 border border-sys/60 bg-sys/10 font-sys text-[10px] tracking-[0.14em] text-sys-bright disabled:opacity-40"
                      >
                        SAVE
                      </button>
                    </div>
                    <p className="mt-2 font-sys text-[10px] leading-relaxed text-ink-faint">
                      Abandoning sets it down. The quests inside it and
                      everything you did stay on the record.
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditing(epic.id);
                      setDraftTitle(epic.title);
                      setDraftIntent(epic.intent ?? "");
                    }}
                    data-testid={`epic-open-${epic.id}`}
                    className="mt-2 min-h-11 w-full border border-edge/60 font-sys text-[10px] tracking-[0.16em] text-ink-faint transition-colors hover:border-sys/50 hover:text-sys"
                  >
                    EDIT · ABANDON
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-5 text-center font-sys text-[12px] leading-relaxed text-ink-dim">
          No epics declared.
          <br />
          A quest without a larger aim is only a chore.
        </p>
      )}

      <NewEpicForm
        open={open}
        onOpenChange={setOpen}
        onCreated={(e) => {
          onCreated(e);
          setOpen(false);
        }}
      />
    </Panel>
  );
}

function NewEpicForm({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (epic: EpicRow) => void;
}) {
  const { createEpic } = useActions();
  const [title, setTitle] = useState("");
  const [intent, setIntent] = useState("");
  const [domain, setDomain] = useState<DomainKey>("craft");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => onOpenChange(true)}
        data-testid="declare-epic"
        className="w-full border-t border-edge/60 px-4 py-3 text-left font-sys text-[11px] tracking-[0.16em] text-ink-dim transition-colors hover:bg-sys/5 hover:text-sys"
      >
        + DECLARE AN EPIC
      </button>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await createEpic({ title, intent, domain });
    setSubmitting(false);
    if (!result.ok || !result.id) {
      setError(result.ok ? "Something went wrong." : result.error);
      return;
    }
    onCreated({
      id: result.id,
      title: title.trim(),
      intent: intent.trim() || null,
      domain,
      status: "active",
    });
    setTitle("");
    setIntent("");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="animate-rise border-t border-edge/60 px-4 py-4"
    >
      <label className="block">
        <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
          EPIC
        </span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Repair the bond with my father"
          className="mt-1.5 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
        />
      </label>

      <label className="mt-3 block">
        <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
          WHY THIS MATTERS
        </span>
        <input
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Stated in your own words."
          className="mt-1.5 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
        />
      </label>

      <label className="mt-3 block">
        <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
          DOMAIN
        </span>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value as DomainKey)}
          className="mt-1.5 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink focus:border-sys focus:outline-none"
        >
          {DOMAIN_KEYS.map((k) => (
            <option key={k} value={k} className="bg-panel">
              {DOMAIN_DISPLAY[k].label}
            </option>
          ))}
        </select>
      </label>

      <p className="mt-3 font-sys text-[10px] leading-relaxed text-ink-faint">
        Declaring this grants nothing. Only what you do inside it will.
      </p>

      {error && (
        <p className="mt-3 font-sys text-[11px] text-rust">[ REJECTED ] {error}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="border border-edge py-2.5 font-sys text-[11px] tracking-[0.16em] text-ink-dim transition-colors hover:border-rust/50"
        >
          CANCEL
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="border border-sys/60 bg-sys/10 py-2.5 font-sys text-[11px] tracking-[0.16em] text-sys-bright transition-colors hover:bg-sys/20 disabled:opacity-40"
        >
          {submitting ? "…" : "DECLARE"}
        </button>
      </div>
    </form>
  );
}
