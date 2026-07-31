"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { play } from "@/lib/sound";

/**
 * A System window. Panels resolve, they don't appear — a scan line sweeps
 * down and the panel materializes behind it. One gesture, used everywhere,
 * so the whole thing reads as a system rather than a website.
 */
export function Panel({
  children,
  label,
  delay = 0,
  sound = true,
  className = "",
  tone = "sys",
}: {
  children: ReactNode;
  label?: string;
  delay?: number;
  sound?: boolean;
  className?: string;
  tone?: "sys" | "warn" | "gold";
}) {
  const [shown, setShown] = useState(false);
  const played = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (shown && sound && !played.current) {
      played.current = true;
      play("panel");
    }
  }, [shown, sound]);

  const edge =
    tone === "warn"
      ? "border-rust/50"
      : tone === "gold"
        ? "border-integrity/30"
        : "border-edge";

  if (!shown) return <div className={className} aria-hidden />;

  return (
    <section
      className={`relative animate-panel border ${edge} bg-panel/70 backdrop-blur-sm ${className}`}
    >
      {/* the sweeping scan line */}
      <span
        aria-hidden
        className="animate-scan pointer-events-none absolute inset-x-0 top-0 h-full bg-linear-to-b from-sys/25 to-transparent"
      />
      <Corners />
      {label && (
        <header className="border-b border-edge/70 px-3 py-1.5">
          <h2 className="font-sys text-[10px] tracking-[0.22em] text-sys-dim uppercase">
            {label}
          </h2>
        </header>
      )}
      {children}
    </section>
  );
}

/** Bracket corners — the panel is a frame, not a card. */
function Corners() {
  const base =
    "pointer-events-none absolute h-2.5 w-2.5 border-sys/70 animate-edge";
  return (
    <span aria-hidden>
      <span className={`${base} -top-px -left-px border-t border-l`} />
      <span className={`${base} -top-px -right-px border-t border-r`} />
      <span className={`${base} -bottom-px -left-px border-b border-l`} />
      <span className={`${base} -right-px -bottom-px border-r border-b`} />
    </span>
  );
}
