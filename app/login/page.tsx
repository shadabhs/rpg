"use client";

import { useState } from "react";
import { Panel } from "@/components/Panel";
import { createClient } from "@/lib/supabase/client";

type Stage = "form" | "sent" | "error";

/**
 * Two ways in, no password to manage either way: a magic link, or Google
 * OAuth (provider configured in Supabase Auth; the callback route's
 * exchangeCodeForSession handles both flows identically). In the System's
 * voice per AGENTS.md: it states facts, it doesn't flatter, and it never
 * pretends to know something it doesn't.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  async function onGoogle() {
    setGoogleSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    // On success the browser navigates away to Google — only an error
    // ever brings control back here.
    if (error) {
      setErrorMessage(error.message);
      setStage("error");
      setGoogleSubmitting(false);
    }
  }

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
                    disabled={submitting || googleSubmitting}
                    className="mt-6 w-full border border-sys/60 bg-sys/10 py-3.5 font-sys text-[11px] tracking-[0.24em] text-sys-bright transition-colors hover:bg-sys/20 active:bg-sys/30 disabled:opacity-40"
                  >
                    {submitting ? "SENDING…" : "REQUEST KEY"}
                  </button>
                </form>

                <div className="mt-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-edge" />
                  <span className="font-sys text-[10px] tracking-[0.2em] text-ink-faint">
                    OR
                  </span>
                  <span className="h-px flex-1 bg-edge" />
                </div>

                <button
                  type="button"
                  onClick={onGoogle}
                  disabled={submitting || googleSubmitting}
                  data-testid="google-signin"
                  className="mt-5 flex w-full items-center justify-center gap-3 border border-edge py-3.5 font-sys text-[11px] tracking-[0.24em] text-ink-dim transition-colors hover:border-sys/60 hover:text-sys active:bg-sys/10 disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5">
                    <path
                      fill="currentColor"
                      d="M21.6 12.23c0-.68-.06-1.36-.19-2.02H12v3.83h5.4a4.6 4.6 0 0 1-2 3.02v2.5h3.22c1.89-1.74 2.98-4.3 2.98-7.33Z"
                    />
                    <path
                      fill="currentColor"
                      opacity="0.7"
                      d="M12 22c2.7 0 4.97-.89 6.62-2.42l-3.22-2.5c-.9.6-2.04.95-3.4.95-2.6 0-4.81-1.76-5.6-4.12H3.06v2.58A10 10 0 0 0 12 22Z"
                    />
                    <path
                      fill="currentColor"
                      opacity="0.45"
                      d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.06a10 10 0 0 0 0 9l3.34-2.6Z"
                    />
                    <path
                      fill="currentColor"
                      opacity="0.7"
                      d="M12 5.97c1.47 0 2.78.5 3.82 1.5l2.86-2.86A9.97 9.97 0 0 0 12 2a10 10 0 0 0-8.94 5.5l3.34 2.6C7.19 7.73 9.4 5.97 12 5.97Z"
                    />
                  </svg>
                  {googleSubmitting ? "OPENING…" : "CONTINUE WITH GOOGLE"}
                </button>
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
