import { findExercise, type Decisions, type SetRecord } from "@exercise-pal/core";
import { reviewSet } from "@/lib/server/coach";
import { assess, identify } from "@/lib/server/decisions";
import { getObjectBytes, getProfile, getSet, listSets, recentCorrections, saveSet } from "@/lib/server/store";
import { currentUser } from "@/lib/server/user";

export const maxDuration = 120;

const AUTO = Number(process.env.AUTO_ACCEPT_CONFIDENCE ?? 0.85);

/**
 * Runs the post-set review:
 * 1. Gemini Decision fills in what the user didn't say (exercise, which weight) with a confidence.
 * 2. Gemini Decision scores the form rubric for that exercise.
 * 3. Claude writes the supportive review using frames, numbers, history and past corrections.
 * Low-confidence guesses are flagged for a one-tap confirmation instead of being trusted.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUser();
  const set = await getSet(userId, (await params).id);
  if (!set) return Response.json({ error: "not found" }, { status: 404 });

  const [profile, history, corrections, jpegs] = await Promise.all([
    getProfile(userId),
    listSets(userId, 30),
    recentCorrections(userId),
    Promise.all(set.keyframeKeys.map(getObjectBytes)),
  ]);

  const updated: SetRecord = { ...set, needsConfirmation: [] };
  const decisions: Decisions = { criteria: {}, faults: {} };
  const context = [
    set.transcript && `The user said: "${set.transcript}".`,
    `${set.reps} reps counted by body tracking.`,
    profile.backSensitive && "The user has a sensitive back.",
  ]
    .filter(Boolean)
    .join(" ");

  let geminiError: string | null = null;
  if (jpegs.length && process.env.GEMINI_API_KEY) {
    try {
      const needExercise = !set.exerciseId;
      const needEquipment = !set.equipmentId && profile.equipment.length > 0;
      if (needExercise || needEquipment) {
        const id = await identify(jpegs, needEquipment ? profile.equipment : [], context);
        if (needExercise && id.exercise) {
          decisions.exercise = id.exercise;
          if (id.exercise.value !== "other") {
            updated.exerciseId = id.exercise.value;
            updated.exerciseSource = "vision";
          }
          if (id.exercise.confidence < AUTO || id.exercise.value === "other") updated.needsConfirmation.push("exercise");
        }
        if (needEquipment) {
          const only = profile.equipment.length === 1 ? profile.equipment[0] : undefined;
          const chosen = only ?? profile.equipment.find((e) => e.id === id.equipment?.value);
          if (id.equipment) decisions.equipment = id.equipment;
          if (chosen) {
            updated.equipmentId = chosen.id;
            if (updated.weightKg === null) {
              updated.weightKg = chosen.weightKg;
              updated.weightIsTotal = false;
              updated.weightSource = "vision";
            }
          }
          if (!only && (!id.equipment || id.equipment.confidence < AUTO)) updated.needsConfirmation.push("equipment");
        }
      }
      const exercise = findExercise(updated.exerciseId);
      if (exercise) Object.assign(decisions, await assess(jpegs, exercise, context));
    } catch (e) {
      geminiError = (e as Error).message;
    }
  }
  if (updated.weightKg === null) updated.needsConfirmation.push("weight");
  updated.decisions = decisions;

  let reviewError: string | null = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      updated.review = await reviewSet({
        set: updated,
        exercise: findExercise(updated.exerciseId),
        decisions,
        profile,
        history: history.filter((h) => h.id !== set.id),
        corrections,
        jpegs,
      });
    } catch (e) {
      reviewError = (e as Error).message;
    }
  }

  updated.updatedAt = new Date().toISOString();
  await saveSet(updated);
  return Response.json({ set: updated, errors: { decisions: geminiError, review: reviewError } });
}
