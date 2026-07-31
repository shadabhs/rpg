/**
 * THE SYSTEM — sound engine
 *
 * Five sounds, synthesized with the Web Audio API rather than shipped as
 * files. Reasons: no binary assets in the repo, nothing to download, and
 * pure tones are exactly right for the aesthetic — the System is an
 * instrument, not an orchestra.
 *
 * Default ON per DESIGN.md ("nobody discovers audio that ships muted"),
 * with a persistent, obvious mute control.
 */

export type Cue = "panel" | "tick" | "complete" | "levelUp" | "verify" | "deny";

const MUTE_KEY = "system.muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/**
 * Mute lives in a tiny external store rather than React state so components
 * can read it with useSyncExternalStore — reading localStorage into state
 * from an effect causes cascading renders.
 */
let muted: boolean | null = null;
const listeners = new Set<() => void>();

/** Browsers require a user gesture before audio can start. */
function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;

  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

export function initAudio() {
  const c = ensureContext();
  if (c && c.state === "suspended") void c.resume();
}

export function isMuted(): boolean {
  if (muted === null) {
    muted =
      typeof window !== "undefined" &&
      window.localStorage.getItem(MUTE_KEY) === "1";
  }
  return muted;
}

export function subscribeMuted(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Audio is on by default, so the server always renders the unmuted state. */
export function mutedServerSnapshot() {
  return false;
}

export function setMuted(next: boolean) {
  muted = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  }
  listeners.forEach((l) => l());
}

type ToneOptions = {
  freq: number;
  /** Frequency to glide to, if the tone should sweep. */
  toFreq?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Seconds to wait before this tone starts. */
  delay?: number;
};

function tone({
  freq,
  toFreq,
  duration,
  type = "sine",
  gain = 0.2,
  delay = 0,
}: ToneOptions) {
  const c = ensureContext();
  if (!c || !master) return;

  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const env = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (toFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), t0 + duration);
  }

  // Fast attack, exponential decay — a struck instrument, not a pad.
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(env);
  env.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Short filtered noise burst — used for impact weight under the level-up. */
function noise(duration: number, gain = 0.12, delay = 0) {
  const c = ensureContext();
  if (!c || !master) return;

  const t0 = c.currentTime + delay;
  const frames = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Decaying noise, so it reads as an impact rather than a hiss.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }

  const src = c.createBufferSource();
  src.buffer = buffer;

  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1400, t0);
  lp.frequency.exponentialRampToValueAtTime(220, t0 + duration);

  const env = c.createGain();
  env.gain.setValueAtTime(gain, t0);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(lp);
  lp.connect(env);
  env.connect(master);
  src.start(t0);
}

export function play(cue: Cue) {
  if (isMuted()) return;
  const c = ensureContext();
  if (!c) return;
  if (c.state === "suspended") void c.resume();

  switch (cue) {
    // A panel resolving: low, brief, mechanical.
    case "panel":
      tone({ freq: 320, toFreq: 190, duration: 0.13, type: "triangle", gain: 0.1 });
      break;

    // XP counting. Deliberately tiny — played many times in a row.
    case "tick":
      tone({ freq: 1180, duration: 0.028, type: "square", gain: 0.022 });
      break;

    // Quest complete: a clean two-step rise. The reward is honest and fixed,
    // so the sound is too — no flourish.
    case "complete":
      tone({ freq: 523.25, duration: 0.1, type: "triangle", gain: 0.16 });
      tone({ freq: 783.99, duration: 0.22, type: "triangle", gain: 0.14, delay: 0.085 });
      break;

    // Level up: sub impact, then a rising arpeggio. This lands AFTER the
    // beat of silence — the pause before the payoff is the payoff.
    case "levelUp":
      noise(0.5, 0.16);
      tone({ freq: 70, toFreq: 46, duration: 0.7, type: "sine", gain: 0.3 });
      tone({ freq: 392, duration: 0.16, type: "triangle", gain: 0.15, delay: 0.06 });
      tone({ freq: 587.33, duration: 0.16, type: "triangle", gain: 0.15, delay: 0.17 });
      tone({ freq: 783.99, duration: 0.2, type: "triangle", gain: 0.16, delay: 0.28 });
      tone({ freq: 1046.5, duration: 0.65, type: "triangle", gain: 0.18, delay: 0.4 });
      break;

    // Verification: low, resonant, unhurried. This should feel like weight,
    // not celebration.
    case "verify":
      tone({ freq: 138.59, duration: 0.85, type: "sine", gain: 0.24 });
      tone({ freq: 207.65, duration: 0.7, type: "sine", gain: 0.1, delay: 0.05 });
      break;

    // NOT YET. Not a failure buzzer — a soft, respectful settle.
    case "deny":
      tone({ freq: 330, toFreq: 247, duration: 0.34, type: "sine", gain: 0.14 });
      break;
  }
}
