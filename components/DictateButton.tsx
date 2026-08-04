"use client";

import { useDictation } from "@/lib/speech";
import { initAudio, play } from "@/lib/sound";
import { buzz } from "@/lib/haptics";

/**
 * Speak instead of type. Renders NOTHING where the browser has no speech
 * support, so the surrounding form is never broken by an absent
 * capability — dictation is an accelerant, not a dependency.
 *
 * Appends to whatever is already in the field rather than replacing it,
 * so you can speak a sentence, fix a word by hand, then speak again.
 */
export function DictateButton({
  value,
  onChange,
  label = "Dictate",
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  const { supported, listening, interim, error, start, stop } = useDictation(
    (text) => {
      const joined = value.trim() ? `${value.trim()} ${text}` : text;
      onChange(joined);
    },
  );

  if (!supported) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => {
          initAudio();
          if (listening) {
            stop();
            play("tick");
          } else {
            start();
            play("panel");
            buzz("tap");
          }
        }}
        aria-pressed={listening}
        aria-label={label}
        data-testid="dictate"
        className={`flex min-h-11 w-full items-center justify-center gap-2 border font-sys text-[10px] tracking-[0.18em] transition-colors ${
          listening
            ? "border-sys/70 bg-sys/10 text-sys-bright"
            : "border-edge text-ink-dim hover:border-sys/50 hover:text-sys"
        }`}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5">
          <path
            fill="currentColor"
            d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"
          />
          <path
            fill="currentColor"
            d="M17.9 11a1 1 0 1 0-2 0 3.9 3.9 0 0 1-7.8 0 1 1 0 1 0-2 0 5.9 5.9 0 0 0 4.9 5.8V19H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.2a5.9 5.9 0 0 0 4.9-5.8Z"
          />
        </svg>
        {listening ? "[ LISTENING ] TAP TO STOP" : "SPEAK INSTEAD"}
      </button>

      {listening && interim && (
        <p className="mt-1.5 font-sys text-[11px] leading-relaxed text-ink-faint">
          {interim}
        </p>
      )}

      {error && (
        <p className="mt-1.5 font-sys text-[10px] text-rust">{error}</p>
      )}
    </div>
  );
}
