import { z } from "zod";

/**
 * The typed data model. Everything the app stores, every model response it
 * accepts and every edit the user makes goes through these schemas.
 */

export const BodyRegion = z.enum([
  "upper_back",
  "lats",
  "lower_back",
  "chest",
  "shoulders",
  "biceps",
  "triceps",
  "core",
  "glutes",
  "hamstrings",
  "quads",
  "calves",
]);
export type BodyRegion = z.infer<typeof BodyRegion>;

export const MovementPattern = z.enum([
  "hinge",
  "squat",
  "row",
  "press",
  "curl",
  "lunge",
  "carry",
  "other",
]);
export type MovementPattern = z.infer<typeof MovementPattern>;

export const EquipmentKind = z.enum([
  "dumbbell",
  "kettlebell",
  "barbell",
  "band",
  "bodyweight",
  "machine",
  "other",
]);
export type EquipmentKind = z.infer<typeof EquipmentKind>;

/** One physical piece of kit the user owns, registered once. */
export const Equipment = z.object({
  id: z.string().min(1),
  kind: EquipmentKind,
  weightKg: z.number().nonnegative(),
  label: z.string().optional(),
});
export type Equipment = z.infer<typeof Equipment>;

export const Profile = z.object({
  displayName: z.string().default("You"),
  equipment: z.array(Equipment).default([]),
  /** Back pain or a back injury history: reviews get stricter on spine position. */
  backSensitive: z.boolean().default(false),
  /** Speak rep counts and cues out loud. */
  voiceFeedback: z.boolean().default(true),
  notes: z.string().default(""),
});
export type Profile = z.infer<typeof Profile>;

/** How sure we are about a value and where it came from. */
export const Source = z.enum(["voice", "pose", "vision", "user_edit", "default"]);
export type Source = z.infer<typeof Source>;

/** Per-rep numbers computed on the device from pose landmarks. */
export const RepMetrics = z.object({
  index: z.number().int().nonnegative(),
  startMs: z.number(),
  endMs: z.number(),
  durationSec: z.number().nonnegative(),
  signal: z.string(),
  minDeg: z.number(),
  maxDeg: z.number(),
  torsoAtTurnDeg: z.number().nullable(),
});
export type RepMetrics = z.infer<typeof RepMetrics>;

export const FaultCode = z.enum([
  "rounded_upper_back",
  "rounded_lower_back",
  "head_up_neck_extended",
  "squatting_the_hinge",
  "arms_lifting_the_weight",
  "partial_range",
  "too_fast",
  "torso_swinging",
  "knees_caving",
  "hips_rising_first",
  "shrugging",
  "other",
]);
export type FaultCode = z.infer<typeof FaultCode>;

export const Fault = z.object({
  code: FaultCode,
  severity: z.enum(["minor", "moderate", "major"]),
  evidence: z.string(),
  cue: z.string(),
});
export type Fault = z.infer<typeof Fault>;

/** The post-set review. This is the exact shape the coaching model must return. */
export const Review = z.object({
  summary: z.string(),
  wentWell: z.array(z.string()),
  faults: z.array(Fault),
  spokenCues: z.array(z.string()),
  nextTime: z.string(),
  loadAdvice: z.enum(["increase", "keep", "decrease", "unknown"]),
  safetyNote: z.string().nullable(),
});
export type Review = z.infer<typeof Review>;

/** One calibrated decision with its confidence (0..1). */
export const Decision = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number()).optional(),
});
export type Decision = z.infer<typeof Decision>;

export const Decisions = z.object({
  exercise: Decision.optional(),
  equipment: Decision.optional(),
  criteria: z.record(z.string(), z.object({ score: z.number(), confidence: z.number() })).default({}),
  faults: z.record(z.string(), z.number()).default({}),
});
export type Decisions = z.infer<typeof Decisions>;

/** What the phone sends at the end of a set. No video, only numbers and a few small keyframes. */
export const SetDraft = z.object({
  exerciseId: z.string().nullable(),
  equipmentId: z.string().nullable(),
  weightKg: z.number().nonnegative().nullable(),
  weightIsTotal: z.boolean().default(true),
  reps: z.number().int().nonnegative(),
  repsSource: Source,
  weightSource: Source,
  exerciseSource: Source,
  rpe: z.number().min(1).max(10).nullable().default(null),
  transcript: z.string().default(""),
  repMetrics: z.array(RepMetrics).default([]),
  startedAt: z.string(),
  endedAt: z.string(),
  device: z.enum(["phone", "desktop"]).default("phone"),
});
export type SetDraft = z.infer<typeof SetDraft>;

export const SetRecord = SetDraft.extend({
  id: z.string(),
  userId: z.string(),
  keyframeKeys: z.array(z.string()).default([]),
  decisions: Decisions.optional(),
  review: Review.optional(),
  needsConfirmation: z.array(z.enum(["exercise", "equipment", "weight", "reps"])).default([]),
  updatedAt: z.string(),
});
export type SetRecord = z.infer<typeof SetRecord>;

/** Any edit the user makes to something the system guessed. This is the learning signal. */
export const Correction = z.object({
  id: z.string(),
  setId: z.string(),
  field: z.enum(["exercise", "equipment", "weight", "reps", "fault"]),
  predicted: z.string().nullable(),
  actual: z.string().nullable(),
  at: z.string(),
});
export type Correction = z.infer<typeof Correction>;

/** Fields the user may edit after a set. */
export const SetPatch = z.object({
  exerciseId: z.string().nullable().optional(),
  equipmentId: z.string().nullable().optional(),
  weightKg: z.number().nonnegative().nullable().optional(),
  weightIsTotal: z.boolean().optional(),
  reps: z.number().int().nonnegative().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(),
});
export type SetPatch = z.infer<typeof SetPatch>;
