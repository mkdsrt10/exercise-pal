import "server-only";
import { CATALOG, findExercise, type Decisions, type Equipment, type ExerciseDef } from "@exercise-pal/core";

/**
 * Calibrated decisions with Gemini Decision 1 (Gemini Decisions API).
 * Scores fixed options and returns probabilities plus a confidence, so the app
 * can auto-log confident answers and only ask the user about the rest.
 *
 * Docs: https://aistudio.google.com/docs/decisions-api
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/decisions";
const MODEL = "gemini-decision-1";

type Question =
  | { type: "noul"; instructions: string; criteria?: { true_description: string; false_description: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

type Answer =
  | { type: "noul"; noul: number; confidence: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; probabilities?: Record<string, number>; confidence: number };

type InputBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mime_type: "image/jpeg"; resolution?: "low" | "medium" | "high" };

async function decide(input: InputBlock[], questions: Record<string, Question>): Promise<Record<string, Answer>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ model: MODEL, input, questions }),
  });
  if (!res.ok) throw new Error(`Gemini Decisions ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { answers?: Record<string, Answer> };
  return body.answers ?? {};
}

function frames(jpegs: Uint8Array[]): InputBlock[] {
  return jpegs.map((b) => ({
    type: "image" as const,
    data: Buffer.from(b).toString("base64"),
    mime_type: "image/jpeg" as const,
    resolution: "medium" as const,
  }));
}

const FAULT_TEXT: Record<string, string> = {
  rounded_upper_back: "The upper back is rounded, with the shoulders slumping forward.",
  rounded_lower_back: "The lower back is rounded instead of flat.",
  head_up_neck_extended: "The head is lifted, with the chin up and the neck bent back.",
  squatting_the_hinge: "The movement is a squat (deep knee bend, hips drop) instead of a hip hinge.",
  arms_lifting_the_weight: "The arms or shoulders lift the weight instead of the hips driving it.",
  partial_range: "Reps are cut short of the full range of motion.",
  too_fast: "Reps are rushed, with no control on the way back.",
  torso_swinging: "The torso swings or stands up to help move the weight.",
  knees_caving: "The knees cave inward.",
  hips_rising_first: "The hips rise faster than the chest.",
  shrugging: "The shoulders shrug up toward the ears.",
};

export async function identify(
  jpegs: Uint8Array[],
  equipment: Equipment[],
  context: string,
): Promise<Pick<Decisions, "exercise" | "equipment">> {
  const questions: Record<string, Question> = {
    exercise: {
      type: "choice",
      instructions: "Which exercise is the person performing in these frames from one set?",
      criteria: {
        ...Object.fromEntries(CATALOG.map((e) => [e.id, e.name])),
        other: "Something else",
      },
    },
  };
  if (equipment.length > 1) {
    questions.equipment = {
      type: "choice",
      instructions: "Which of the user's registered weights is being used? Use visible markings, size and colour.",
      criteria: Object.fromEntries(
        equipment.map((e) => [e.id, `${e.label ?? e.kind} ${e.weightKg} kg`]),
      ),
    };
  }
  const a = await decide([...frames(jpegs), { type: "text", text: context }], questions);
  const pick = (x: Answer | undefined) =>
    x && x.type === "choice" ? { value: x.choice, confidence: x.confidence, probabilities: x.probabilities } : undefined;
  return { exercise: pick(a.exercise), equipment: pick(a.equipment) };
}

export async function assess(
  jpegs: Uint8Array[],
  exercise: ExerciseDef,
  context: string,
): Promise<Pick<Decisions, "criteria" | "faults">> {
  const questions: Record<string, Question> = {};
  for (const c of exercise.criteria) {
    questions[`c_${c.id}`] = { type: "score", instructions: c.question, criteria: c.levels };
  }
  for (const f of exercise.watchFor) {
    const text = FAULT_TEXT[f];
    if (text) questions[`f_${f}`] = { type: "noul", instructions: `In this ${exercise.name} set: ${text}` };
  }
  const a = await decide([...frames(jpegs), { type: "text", text: context }], questions);

  const criteria: Decisions["criteria"] = {};
  const faults: Decisions["faults"] = {};
  for (const [k, v] of Object.entries(a)) {
    if (k.startsWith("c_") && v.type === "score") {
      const levels = exercise.criteria.find((c) => `c_${c.id}` === k)?.levels.length ?? 1;
      // Normalise to 0..1 so scores compare across rubrics.
      criteria[k.slice(2)] = { score: v.score / Math.max(1, levels - 1), confidence: v.confidence };
    } else if (k.startsWith("f_") && v.type === "noul") {
      faults[k.slice(2)] = v.noul;
    }
  }
  return { criteria, faults };
}

export { findExercise };
