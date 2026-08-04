"use client";

import { useEffect, useState } from "react";

/**
 * Deploy watcher for the standalone PWA, which has no address bar and no
 * reload button: it takes the running build's identity at mount, then
 * re-checks whenever the app returns to the foreground (the moment that
 * matters on a phone) and every few minutes besides. When the server
 * answers with a different build, a single tappable line appears.
 *
 * States a fact and waits — no auto-reload that could eat a half-typed
 * quest, no nagging.
 */
export function UpdateWatch() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let baseline: string | null = null;
    let cancelled = false;

    async function version(): Promise<string | null> {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return null;
        return (await res.json()).v ?? null;
      } catch {
        return null;
      }
    }

    async function check() {
      const v = await version();
      if (cancelled || v === null || v === "dev") return;
      if (baseline === null) {
        baseline = v;
        return;
      }
      if (v !== baseline) setAvailable(true);
    }

    void check(); // establish the baseline
    const interval = setInterval(check, 5 * 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!available) return null;

  return (
    <button
      onClick={() => window.location.reload()}
      data-testid="update-available"
      className="fixed inset-x-0 top-0 z-50 min-h-11 border-b border-sys/50 bg-void/95 px-4 font-sys text-[11px] tracking-[0.18em] text-sys-bright backdrop-blur-sm"
    >
      [ UPDATE ] A newer System is available — tap to receive it.
    </button>
  );
}
