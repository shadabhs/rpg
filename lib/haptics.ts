/**
 * Haptics. Works on Android Chrome (including installed PWAs); silently
 * absent on iOS. Tied to the same mute switch as audio, so one control
 * turns off all physical feedback.
 */

import { isMuted } from "./sound";

type Pattern = "tap" | "complete" | "levelUp" | "weight";

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 12,
  complete: [18, 40, 26],
  levelUp: [40, 60, 40, 60, 120],
  weight: 60,
};

export function buzz(pattern: Pattern) {
  if (isMuted()) return;
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Vibration can be blocked by user settings or engagement heuristics.
    // Never let feedback break the interaction.
  }
}
