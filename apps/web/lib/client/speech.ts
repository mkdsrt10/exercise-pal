"use client";

/**
 * Hands-free voice: the browser's speech recognition for input and speech
 * synthesis for feedback. Nothing is recorded or uploaded as audio by the app;
 * only the final transcript text is kept with the set.
 */

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

export function speechSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Keeps listening until stopped; restarts itself when the browser times out. */
export function listen(onFinal: (text: string) => void): () => void {
  const w = window as unknown as Record<string, new () => Recognition>;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return () => {};
  let active = true;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = navigator.language || "en-US";
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]!;
      if (r.isFinal) onFinal(r[0]!.transcript.trim());
    }
  };
  rec.onend = () => {
    if (active) {
      try {
        rec.start();
      } catch {
        /* already started */
      }
    }
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed") active = false;
  };
  rec.start();
  return () => {
    active = false;
    rec.stop();
  };
}

let lastSpoken = 0;

/** Speaks a short line. `interrupt` cuts off anything still being said (used for rep counts). */
export function say(text: string, opts: { interrupt?: boolean; minGapMs?: number } = {}) {
  if (typeof speechSynthesis === "undefined") return;
  const now = Date.now();
  if (opts.minGapMs && now - lastSpoken < opts.minGapMs) return;
  lastSpoken = now;
  if (opts.interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  speechSynthesis.speak(u);
}
