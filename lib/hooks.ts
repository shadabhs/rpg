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

/**
 * The viewer's UTC offset in minutes (IST = +330), for day-boundary math —
 * streaks and "done today" are about the player's day, not UTC's. Server
 * snapshot is 0: the server can't know the client's timezone, and via
 * useSyncExternalStore the client corrects on hydration without a mismatch
 * error (same trick as useReducedMotion above).
 */
function subscribeTz() {
  return () => {};
}

function tzSnapshot() {
  return -new Date().getTimezoneOffset();
}

function tzServerSnapshot() {
  return 0;
}

export function useTzOffsetMinutes(): number {
  return useSyncExternalStore(subscribeTz, tzSnapshot, tzServerSnapshot);
}
