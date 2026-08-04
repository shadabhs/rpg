"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * Dictation via the browser's built-in Web Speech API.
 *
 * Chosen over a hosted transcription model deliberately: it is free, needs
 * no API key, consumes no rate limit, and returns words as you speak them
 * rather than after an upload round trip. Nothing is recorded or sent by
 * this app — the platform handles capture.
 *
 * Support is uneven (Chrome and Safari yes, Firefox no, and headless
 * browsers never), so `supported` is checked before anything renders. The
 * mic is an accelerant, never a requirement: typing always works.
 */

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
};
type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => RecognitionLike;

/** Speech support never changes within a page life, so there is nothing
 *  to subscribe to. */
const subscribeNever = () => () => {};

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type Dictation = {
  supported: boolean;
  listening: boolean;
  /** Words not yet finalised — shown greyed so speech feels live. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
};

/**
 * @param onText called with each finalised phrase, to be appended by the
 *        caller. Finalised text is never re-emitted.
 */
export function useDictation(onText: (text: string) => void): Dictation {
  // Support is a property of the browser, not of React state — read it
  // once via useSyncExternalStore so the server renders "unsupported"
  // and the client corrects on hydration without an effect.
  const supported = useSyncExternalStore(
    subscribeNever,
    () => getCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<RecognitionLike | null>(null);
  // Keep the latest callback reachable from recognition events without
  // re-subscribing. Written in an effect, never during render.
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => {
    const rec = recRef;
    return () => {
      rec.current?.abort();
      rec.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    recRef.current?.abort();

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang =
      typeof navigator !== "undefined" ? (navigator.language ?? "en-US") : "en-US";

    rec.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const text = r[0].transcript.trim();
          if (text) onTextRef.current(text);
        } else {
          pending += r[0].transcript;
        }
      }
      setInterim(pending);
    };

    rec.onerror = (e) => {
      // A pause in speech is not a failure; anything else is worth saying.
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError(
        e.error === "not-allowed"
          ? "Microphone access was refused. Type instead."
          : "Dictation failed. Type instead.",
      );
      setListening(false);
      setInterim("");
    };

    rec.onend = () => {
      setListening(false);
      setInterim("");
    };

    recRef.current = rec;
    setError(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Dictation could not start. Type instead.");
    }
  }, []);

  return { supported, listening, interim, error, start, stop };
}
