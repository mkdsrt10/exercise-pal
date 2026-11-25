import { CATALOG } from "./catalog";
import type { EquipmentKind } from "./schema";

/**
 * Turns what the user says mid-set into structured fields.
 * "two dumbbells, seven and a half kilos each, twelve reps" ->
 *   { equipmentKind: "dumbbell", weightKg: 7.5, weightIsTotal: false, reps: 12 }
 *
 * Deterministic and offline, so it works with any speech-to-text engine.
 */

export interface VoiceLog {
  command?: "start" | "stop" | "undo";
  exerciseId?: string;
  equipmentKind?: EquipmentKind;
  weightKg?: number;
  weightIsTotal?: boolean;
  reps?: number;
  rpe?: number;
}

const ONES: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, a: 1, an: 1,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Replaces spelled-out numbers with digits: "seven and a half" -> "7.5". */
export function wordsToNumbers(input: string): string {
  const tokens = input
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/(\d)(kg|kgs|kilos?|lbs?|k)\b/g, "$1 $2")
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const out: string[] = [];
  let i = 0;
  const isNumWord = (t: string | undefined) =>
    t !== undefined && t !== "a" && t !== "an" && (t in ONES || t in TENS || t === "hundred");

  while (i < tokens.length) {
    const t = tokens[i]!;
    if (!isNumWord(t) && !/^\d+(\.\d+)?$/.test(t)) {
      out.push(t);
      i += 1;
      continue;
    }
    let value: number;
    if (/^\d/.test(t)) {
      value = Number(t);
      i += 1;
    } else {
      value = 0;
      while (i < tokens.length && isNumWord(tokens[i])) {
        const w = tokens[i]!;
        if (w === "hundred") value = (value || 1) * 100;
        else if (w in TENS) value += TENS[w]!;
        else value += ONES[w]!;
        i += 1;
      }
    }
    // "point five"
    if (tokens[i] === "point" && i + 1 < tokens.length) {
      const d = tokens[i + 1]!;
      const digit = /^\d+$/.test(d) ? d : d in ONES && d !== "a" && d !== "an" ? String(ONES[d]) : null;
      if (digit !== null) {
        value = Number(`${Math.trunc(value)}.${digit}`);
        i += 2;
      }
    }
    // "and a half" / "and half"
    if (tokens[i] === "and" && (tokens[i + 1] === "half" || (tokens[i + 1] === "a" && tokens[i + 2] === "half"))) {
      value += 0.5;
      i += tokens[i + 1] === "half" ? 2 : 3;
    }
    out.push(String(value));
  }
  return out.join(" ");
}

const KG = /^(kg|kgs|kilo|kilos|kilogram|kilograms|k)$/;
const LB = /^(lb|lbs|pound|pounds)$/;
const REPS = /^(rep|reps|repetitions?|times)$/;

const EQUIPMENT: [RegExp, EquipmentKind][] = [
  [/\bkettle ?bells?\b|\bkb\b/, "kettlebell"],
  [/\bdumb ?bells?\b|\bdb\b/, "dumbbell"],
  [/\bbar ?bell\b|\bbarbells?\b/, "barbell"],
  [/\bbands?\b/, "band"],
  [/\bbody ?weight\b|\bno weight\b/, "bodyweight"],
];

const ALIASES = CATALOG.flatMap((e) => e.aliases.map((a) => ({ alias: a.toLowerCase(), id: e.id }))).sort(
  (a, b) => b.alias.length - a.alias.length,
);

export function parseVoiceLog(text: string): VoiceLog {
  const norm = wordsToNumbers(text);
  const tokens = norm.split(" ");
  const out: VoiceLog = {};
  const raw = ` ${norm} `;

  if (/\b(start|begin|go|let's go|lets go)\b/.test(raw)) out.command = "start";
  if (/\b(stop|done|finished|finish|end set|that's it|thats it)\b/.test(raw)) out.command = "stop";
  if (/\b(undo|scratch that|cancel that)\b/.test(raw)) out.command = "undo";

  for (const [re, kind] of EQUIPMENT) {
    if (re.test(raw)) {
      out.equipmentKind = kind;
      break;
    }
  }

  for (const { alias, id } of ALIASES) {
    if (new RegExp(`\\b${alias.replace(/[-]/g, " ")}\\b`).test(raw)) {
      // "dumbbell swing" must win over "swing"; the list is sorted longest first.
      out.exerciseId = id;
      break;
    }
  }
  if (out.exerciseId === "kettlebell_swing" && out.equipmentKind === "dumbbell") out.exerciseId = "dumbbell_swing";

  for (let i = 0; i < tokens.length; i++) {
    const n = Number(tokens[i]);
    if (!Number.isFinite(n) || tokens[i] === "") continue;
    const next = tokens[i + 1] ?? "";
    const prev = tokens[i - 1] ?? "";
    if (KG.test(next)) out.weightKg = n;
    else if (LB.test(next)) out.weightKg = Math.round(n * 0.45359237 * 10) / 10;
    else if (REPS.test(next)) out.reps = Math.round(n);
    else if (prev === "rpe") out.rpe = n;
    else if (prev === "did" || prev === "done") out.reps = Math.round(n);
  }

  if (out.weightKg !== undefined) {
    if (/\b(each|per hand|per side|a side|each hand|each side)\b/.test(raw)) out.weightIsTotal = false;
    else if (/\b(total|in total|altogether|combined)\b/.test(raw)) out.weightIsTotal = true;
  }

  if (out.rpe === undefined) {
    if (/\b(too easy|very easy|easy)\b/.test(raw)) out.rpe = 6;
    else if (/\b(very hard|failure|couldn't|could not)\b/.test(raw)) out.rpe = 10;
    else if (/\b(hard|tough)\b/.test(raw)) out.rpe = 8.5;
  }

  return out;
}
