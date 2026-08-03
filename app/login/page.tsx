"use client";

import { useState } from "react";
import { Panel } from "@/components/Panel";
import { createClient } from "@/lib/supabase/client";

type Stage = "form" | "sent" | "error";

/**
 * Magic link only — no password to manage, no OAuth app to register before
 * this can be tested. In the System's voice per AGENTS.md: it states facts,
 * it doesn't flatter, and it never pretends to know something it doesn't.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      setStage("error");
      return;
    }
    setStage("sent");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4">
      <div className="w-full">
        <p className="mb-3 text-center font-sys text-[11px] tracking-[0.34em] text-sys">
          THE SYSTEM
        </p>

        <Panel label="Identification" delay={80}>
          <div className="p-5">
            {stage !== "sent" && (
              <>
                <p className="font-sys text-[12px] leading-relaxed text-ink-dim">
                  The System does not know you yet.
                  <br />
                  Provide an address. A single-use key will be sent.
                </p>

                <form onSubmit={onSubmit} className="mt-5">
                  <label className="block">
                    <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
                      EMAIL
                    </span>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@wherever.com"
                      className="mt-2 w-full border-b border-edge bg-transparent pb-1.5 font-sys text-sm text-ink placeholder:text-ink-faint focus:border-sys focus:outline-none"
                    />
                  </label>

                  {stage === "error" && (
                    <p className="mt-3 font-sys text-[11px] text-rust">
                      [ REJECTED ] {errorMessage}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-6 w-full border border-sys/60 bg-sys/10 py-3.5 font-sys text-[11px] tracking-[0.24em] text-sys-bright transition-colors hover:bg-sys/20 active:bg-sys/30 disabled:opacity-40"
                  >
                    {submitting ? "SENDING…" : "REQUEST KEY"}
                  </button>
                </form>
              </>
            )}

            {stage === "sent" && (
              <div className="animate-rise text-center">
                <p className="font-sys text-[11px] tracking-[0.2em] text-integrity">
                  [ KEY SENT ]
                </p>
                <p className="mt-3 font-sys text-[12px] leading-relaxed text-ink-dim">
                  Check {email}.
                  <br />
                  The link expires after one use.
                </p>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </main>
  );
}
