import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { Review, type Correction, type Decisions, type ExerciseDef, type Profile, type SetRecord } from "@exercise-pal/core";

/**
 * Post-set review: a short, supportive coaching note in the exact Review shape.
 * Input is a few keyframes plus the numbers measured on the phone, never video.
 */

const client = new Anthropic();
const MODEL = process.env.COACH_MODEL ?? "claude-opus-5-5";

const SYSTEM = `You are Exercise Pal, a calm, encouraging training partner reviewing one set of a home workout.
You see a few keyframes from the set plus measurements computed from body tracking, and calibrated scores from a separate vision model.

How to review:
- Lead with what went well, then at most three fixes, most important first.
- Each fix needs evidence you can actually see in the frames or numbers, and one short cue the user can act on in the next set.
- Say plainly when something is out of frame or too dark to judge. Never guess at what you cannot see.
- spokenCues are read aloud between sets: under 8 words each, friendly, no jargon.
- loadAdvice: "increase" only if every rep looked controlled and easy; "decrease" if form broke down under the load.
- The user trains alone without a coach. Keep it simple and kind; never shame.

Back safety:
- If the profile says backSensitive, treat any spine rounding under load as the top priority, suggest a lighter load or a gentler variation, and set safetyNote.
- You are not a medical professional. If the user mentions pain, set safetyNote to suggest stopping that movement and checking with a physiotherapist or doctor.`;

export async function reviewSet(args: {
  set: SetRecord;
  exercise: ExerciseDef | undefined;
  decisions: Decisions | undefined;
  profile: Profile;
  history: SetRecord[];
  corrections: Correction[];
  jpegs: Uint8Array[];
}): Promise<Review> {
  const { set, exercise, decisions, profile, history, corrections, jpegs } = args;

  const pastFaults = history
    .filter((h) => h.exerciseId === set.exerciseId && h.review)
    .slice(0, 5)
    .map((h) => ({ date: h.startedAt.slice(0, 10), faults: h.review!.faults.map((f) => f.code) }));

  const facts = {
    exercise: exercise?.name ?? "unknown",
    pattern: exercise?.pattern,
    reps: set.reps,
    weightKg: set.weightKg,
    weightIsTotal: set.weightIsTotal,
    rpe: set.rpe,
    whatTheUserSaid: set.transcript || undefined,
    perRep: set.repMetrics.map((r) => ({
      rep: r.index + 1,
      seconds: r.durationSec,
      trackedJoint: r.signal,
      rangeDeg: Math.round(r.maxDeg - r.minDeg),
      torsoFromVerticalAtTurnDeg: r.torsoAtTurnDeg,
    })),
    calibratedScores: decisions && { criteria: decisions.criteria, faultProbabilities: decisions.faults },
    profile: { backSensitive: profile.backSensitive, notes: profile.notes || undefined },
    recentFaultsOnThisExercise: pastFaults,
    userCorrectionsToEarlierGuesses: corrections.slice(0, 10).map((c) => `${c.field}: ${c.predicted} -> ${c.actual}`),
  };

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(Review) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          ...jpegs.map((b) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: "image/jpeg" as const, data: Buffer.from(b).toString("base64") },
          })),
          { type: "text", text: `Keyframes above are in time order.\n\n${JSON.stringify(facts, null, 2)}` },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("Review was declined for this set.");
  if (!response.parsed_output) throw new Error("Review did not match the expected shape.");
  return response.parsed_output;
}
