"use client";

import { useSyncExternalStore } from "react";
import { isMuted, mutedServerSnapshot, subscribeMuted } from "./sound";

/**
 * Both of these read from stores that live outside React — a media query and
 * localStorage. Pulling them into state from an effect causes cascading
 * renders (and a flash of the wrong value); useSyncExternalStore is the
 * correct tool.
 */

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function reducedMotionSnapshot() {
  return typeof window !== "undefined" && window.matchMedia(REDUCED).matches;
}

/** Assume motion is fine on the server; the client corrects immediately. */
function reducedMotionServerSnapshot() {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    reducedMotionServerSnapshot,
  );
}

export function useMuted(): boolean {
  return useSyncExternalStore(subscribeMuted, isMuted, mutedServerSnapshot);
}
