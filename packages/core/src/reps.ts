import type { Features } from "./pose";
import type { RepMetrics } from "./schema";

/**
 * Streaming rep counter.
 *
 * Every candidate joint signal (hip, knee, elbow, torso, wrist) gets its own
 * tracker. The signal that moves the most relative to its noise floor leads,
 * and is locked in after two reps so the count can't jump between joints.
 * No exercise label is needed: rows lead on the elbow, swings on the hip.
 *
 * Memory: each tracker keeps only a few seconds of samples.
 */

type Signal = "hip" | "knee" | "elbow" | "torso" | "wrist";
type State = "low" | "high";

const MIN_RANGE: Record<Signal, number> = {
  hip: 30,
  knee: 25,
  elbow: 40,
  torso: 20,
  wrist: 40,
};

export interface RepEvent {
  type: "rep";
  rep: RepMetrics;
}
export interface TurnEvent {
  type: "turn";
  tMs: number;
}
export type CounterEvent = RepEvent | TurnEvent;

class Tracker {
  private samples: { t: number; v: number }[] = [];
  private ema: number | null = null;
  private state: State | null = null;
  private startState: State | null = null;
  private sawOpposite = false;
  private repStart = 0;
  private repMin = Infinity;
  private repMax = -Infinity;
  private turnTorso: number | null = null;
  count = 0;
  range = 0;
  reps: RepMetrics[] = [];

  constructor(
    readonly name: Signal,
    private readonly windowMs: number,
    private readonly alpha: number,
  ) {}

  get strength() {
    return this.range / MIN_RANGE[this.name];
  }

  update(t: number, raw: number, torso: number): CounterEvent | null {
    if (!Number.isFinite(raw)) return null;
    this.ema = this.ema === null ? raw : this.alpha * raw + (1 - this.alpha) * this.ema;
    const v = this.ema;
    this.samples.push({ t, v });
    while (this.samples.length && this.samples[0]!.t < t - this.windowMs) this.samples.shift();

    let lo = Infinity;
    let hi = -Infinity;
    for (const s of this.samples) {
      if (s.v < lo) lo = s.v;
      if (s.v > hi) hi = s.v;
    }
    this.range = hi - lo;
    this.repMin = Math.min(this.repMin, v);
    this.repMax = Math.max(this.repMax, v);
    if (this.range < MIN_RANGE[this.name]) return null;

    const lowTh = lo + 0.3 * this.range;
    const highTh = lo + 0.7 * this.range;
    const next: State | null = v <= lowTh ? "low" : v >= highTh ? "high" : this.state;
    if (next === null) return null;

    if (this.state === null) {
      // Rest position = where the signal sat before the movement started.
      const rest = this.samples[0]!.v;
      this.startState = rest - lo < hi - rest ? "low" : "high";
      this.state = next;
      this.repStart = this.samples[0]!.t;
      if (next !== this.startState) {
        this.sawOpposite = true;
        this.turnTorso = torso;
        return { type: "turn", tMs: t };
      }
      return null;
    }

    if (next === this.state) return null;
    this.state = next;

    if (next !== this.startState) {
      this.sawOpposite = true;
      this.turnTorso = torso;
      return { type: "turn", tMs: t };
    }
    if (!this.sawOpposite) return null;

    const rep: RepMetrics = {
      index: this.count,
      startMs: this.repStart,
      endMs: t,
      durationSec: (t - this.repStart) / 1000,
      signal: this.name,
      minDeg: round(this.repMin),
      maxDeg: round(this.repMax),
      torsoAtTurnDeg: this.turnTorso === null ? null : round(this.turnTorso),
    };
    this.count += 1;
    this.reps.push(rep);
    this.sawOpposite = false;
    this.repStart = t;
    this.repMin = Infinity;
    this.repMax = -Infinity;
    return { type: "rep", rep };
  }
}

const round = (n: number) => Math.round(n * 10) / 10;

export class RepCounter {
  private trackers: Tracker[];
  private leader: Tracker | null = null;
  private locked = false;

  constructor(opts: { windowMs?: number; smoothing?: number } = {}) {
    const w = opts.windowMs ?? 8000;
    const a = opts.smoothing ?? 0.35;
    this.trackers = (Object.keys(MIN_RANGE) as Signal[]).map((s) => new Tracker(s, w, a));
  }

  /** Feed one frame. Returns events from the leading signal only. */
  update(tMs: number, f: Features | null): CounterEvent[] {
    if (!f) return [];
    const events = new Map<Tracker, CounterEvent>();
    for (const tr of this.trackers) {
      const e = tr.update(tMs, f[tr.name], f.torso);
      if (e) events.set(tr, e);
    }
    if (!this.locked) {
      const best = [...this.trackers].sort((a, b) => b.strength - a.strength)[0]!;
      if (best.strength >= 1) this.leader = best;
      if (this.leader && this.leader.count >= 2) this.locked = true;
    }
    const e = this.leader ? events.get(this.leader) : undefined;
    return e ? [e] : [];
  }

  get count(): number {
    return this.leader?.count ?? 0;
  }

  get signal(): string | null {
    return this.leader?.name ?? null;
  }

  get reps(): RepMetrics[] {
    return this.leader?.reps ?? [];
  }
}
