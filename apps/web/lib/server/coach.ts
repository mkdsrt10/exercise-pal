import "server-only";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { Review, type Correction, type Decisions, type ExerciseDef, type Profile, type SetRecord } from "@exercise-pal/core";

/**
 * Post-set review: a short, supportive coaching note in the exact Review shape.
 * Input is a few keyframes plus the numbers measured on the phone, never video.
 *
 * Three ways to run it, picked by COACH_PROVIDER (or automatically):
 *   anthropic  ANTHROPIC_API_KEY, or a login profile from `ant auth login` (no key to manage)
 *   bedrock    Amazon Bedrock with your AWS credentials (AWS_PROFILE / keys) and BEDROCK_REGION
 *   gemini     GEMINI_API_KEY only; the same key also powers the Gemini Decision scoring
 */

export type CoachProvider = "anthropic" | "bedrock" | "gemini";

// A blank line like `ANTHROPIC_API_KEY=` in .env would otherwise win over a login
// profile and authenticate with an empty key. Treat blank as unset.
for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE", "AWS_PROFILE", "COACH_PROVIDER"]) {
  if (process.env[k] === "") delete process.env[k];
}

function hasAnthropicLogin(): boolean {
  const dir = process.env.ANTHROPIC_CONFIG_DIR ?? join(homedir(), ".config", "anthropic");
  return existsSync(join(dir, "credentials"));
}

export function coachProvider(): CoachProvider | null {
  const explicit = process.env.COACH_PROVIDER;
  if (explicit === "anthropic" || explicit === "bedrock" || explicit === "gemini") return explicit;
  const env = process.env;
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_PROFILE || hasAnthropicLogin()) return "anthropic";
  if (env.BEDROCK_REGION || env.AWS_BEARER_TOKEN_BEDROCK) return "bedrock";
  if (env.GEMINI_API_KEY) return "gemini";
  return null;
}

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

  const text = `Keyframes above are in time order.\n\n${JSON.stringify(facts, null, 2)}`;
  const provider = coachProvider();
  if (provider === "gemini") return reviewWithGemini(jpegs, text);
  if (provider === "bedrock") return reviewWithBedrock(jpegs, text);
  if (provider === "anthropic") return reviewWithAnthropic(jpegs, text);
  throw new Error("No coaching provider configured (set ANTHROPIC_API_KEY, log in with `ant auth login`, BEDROCK_REGION, or GEMINI_API_KEY).");
}

const imageBlocks = (jpegs: Uint8Array[]) =>
  jpegs.map((b) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: "image/jpeg" as const, data: Buffer.from(b).toString("base64") },
  }));

let anthropic: Anthropic | null = null;

/** Claude API. A bare client picks up ANTHROPIC_API_KEY or the `ant auth login` profile on its own. */
async function reviewWithAnthropic(jpegs: Uint8Array[], text: string): Promise<Review> {
  anthropic ??= new Anthropic();
  const response = await anthropic.beta.messages.parse({
    model: process.env.COACH_MODEL ?? "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(Review) },
    system: SYSTEM,
    messages: [{ role: "user", content: [...imageBlocks(jpegs), { type: "text", text }] }],
  });
  if (response.stop_reason === "refusal") throw new Error("Review was declined for this set.");
  if (!response.parsed_output) throw new Error("Review did not match the expected shape.");
  return response.parsed_output;
}

let bedrock: AnthropicBedrockMantle | null = null;

/** Amazon Bedrock. Credentials come from the AWS default chain (AWS_PROFILE, SSO, env keys, role). */
async function reviewWithBedrock(jpegs: Uint8Array[], text: string): Promise<Review> {
  bedrock ??= new AnthropicBedrockMantle({
    awsRegion: process.env.BEDROCK_REGION ?? process.env.AWS_REGION,
    awsProfile: process.env.AWS_PROFILE,
  });
  // Server-side refusal fallbacks aren't available on Bedrock, so a refusal is reported instead.
  const response = await bedrock.beta.messages.parse({
    model: process.env.BEDROCK_MODEL ?? "anthropic.claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(Review) },
    system: SYSTEM,
    messages: [{ role: "user", content: [...imageBlocks(jpegs), { type: "text", text }] }],
  });
  if (response.stop_reason === "refusal") throw new Error("Review was declined for this set.");
  if (!response.parsed_output) throw new Error("Review did not match the expected shape.");
  return response.parsed_output;
}

const reviewJsonSchema = (() => {
  const { $schema: _drop, ...schema } = z.toJSONSchema(Review) as Record<string, unknown>;
  return schema;
})();

/** Gemini only: one GEMINI_API_KEY for both the review and the decision scoring. */
async function reviewWithGemini(jpegs: Uint8Array[], text: string): Promise<Review> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_COACH_MODEL ?? "gemini-3.8-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [
        {
          role: "user",
          parts: [
            ...jpegs.map((b) => ({ inline_data: { mime_type: "image/jpeg", data: Buffer.from(b).toString("base64") } })),
            { text },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: reviewJsonSchema },
    }),
  });
  if (!res.ok) throw new Error(`Gemini review ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const out = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const parsed = Review.safeParse(JSON.parse(out || "null"));
  if (!parsed.success) throw new Error("Review did not match the expected shape.");
  return parsed.data;
}
