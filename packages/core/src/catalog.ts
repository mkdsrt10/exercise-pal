import type { BodyRegion, FaultCode, MovementPattern } from "./schema";

export interface Criterion {
  id: string;
  question: string;
  /** Ordered levels, worst first. Used as a rubric for calibrated scoring. */
  levels: string[];
}

export interface ExerciseDef {
  id: string;
  name: string;
  aliases: string[];
  pattern: MovementPattern;
  regions: BodyRegion[];
  criteria: Criterion[];
  /** Faults worth checking for this movement. */
  watchFor: FaultCode[];
  /** Movements that load the spine in flexion or shear: stricter review when the user is back sensitive. */
  spineLoaded: boolean;
}

const spine: Criterion = {
  id: "spine_neutral",
  question: "Does the back stay flat and neutral through every rep, from neck to lower back?",
  levels: ["Clearly rounded on most reps", "Rounds on some reps", "Mostly neutral", "Neutral on every rep"],
};

export const CATALOG: ExerciseDef[] = [
  {
    id: "bent_over_row",
    name: "Bent-over row",
    aliases: ["bent over row", "bent-over row", "row", "rows", "dumbbell row", "barbell row"],
    pattern: "row",
    regions: ["upper_back", "lats", "biceps", "lower_back"],
    spineLoaded: true,
    watchFor: ["rounded_upper_back", "head_up_neck_extended", "torso_swinging", "partial_range", "too_fast", "shrugging"],
    criteria: [
      spine,
      {
        id: "torso_still",
        question: "Does the torso stay still, with no swinging or standing up to move the weight?",
        levels: ["Big swing every rep", "Some swing", "Small movement", "Completely still"],
      },
      {
        id: "full_range",
        question: "Do the elbows travel back past the torso with a squeeze at the top and a full stretch at the bottom?",
        levels: ["Short partial reps", "Some reps partial", "Mostly full", "Full range every rep"],
      },
    ],
  },
  {
    id: "kettlebell_swing",
    name: "Kettlebell swing",
    aliases: ["kettlebell swing", "kb swing", "swing", "swings", "kettlebell swings"],
    pattern: "hinge",
    regions: ["glutes", "hamstrings", "lower_back", "core"],
    spineLoaded: true,
    watchFor: ["squatting_the_hinge", "arms_lifting_the_weight", "rounded_lower_back", "head_up_neck_extended"],
    criteria: [
      spine,
      {
        id: "hinge_not_squat",
        question: "Do the hips push back with only a slight knee bend (a hinge), rather than dropping into a squat?",
        levels: ["Clearly a squat", "Mostly squatting", "Mostly hinging", "Clean hinge"],
      },
      {
        id: "hip_drive",
        question: "Is the weight driven by a hip snap, with the arms only guiding it?",
        levels: ["Arms lift the weight", "Mix of arms and hips", "Mostly hips", "All hips, weight floats"],
      },
    ],
  },
  {
    id: "dumbbell_swing",
    name: "Dumbbell swing",
    aliases: ["dumbbell swing", "db swing", "dumbbell swings"],
    pattern: "hinge",
    regions: ["glutes", "hamstrings", "lower_back", "core"],
    spineLoaded: true,
    watchFor: ["squatting_the_hinge", "arms_lifting_the_weight", "rounded_lower_back", "head_up_neck_extended"],
    criteria: [],
  },
  {
    id: "romanian_deadlift",
    name: "Romanian deadlift",
    aliases: ["romanian deadlift", "rdl", "deadlift", "deadlifts"],
    pattern: "hinge",
    regions: ["hamstrings", "glutes", "lower_back"],
    spineLoaded: true,
    watchFor: ["rounded_lower_back", "squatting_the_hinge", "head_up_neck_extended", "too_fast"],
    criteria: [spine],
  },
  {
    id: "goblet_squat",
    name: "Goblet squat",
    aliases: ["goblet squat", "squat", "squats"],
    pattern: "squat",
    regions: ["quads", "glutes", "core"],
    spineLoaded: false,
    watchFor: ["knees_caving", "rounded_lower_back", "partial_range", "hips_rising_first"],
    criteria: [
      {
        id: "depth",
        question: "Do the hips reach at least knee height with heels down?",
        levels: ["Shallow", "Above parallel", "Parallel", "Below parallel, heels down"],
      },
    ],
  },
  {
    id: "biceps_curl",
    name: "Biceps curl",
    aliases: ["curl", "curls", "biceps curl", "bicep curl", "hammer curl"],
    pattern: "curl",
    regions: ["biceps"],
    spineLoaded: false,
    watchFor: ["torso_swinging", "partial_range", "too_fast"],
    criteria: [],
  },
  {
    id: "overhead_press",
    name: "Overhead press",
    aliases: ["overhead press", "shoulder press", "press", "ohp"],
    pattern: "press",
    regions: ["shoulders", "triceps", "core"],
    spineLoaded: false,
    watchFor: ["torso_swinging", "partial_range", "shrugging"],
    criteria: [],
  },
];

// Dumbbell swing uses the kettlebell swing rubric.
const kb = CATALOG.find((e) => e.id === "kettlebell_swing")!;
CATALOG.find((e) => e.id === "dumbbell_swing")!.criteria = kb.criteria;

export function findExercise(id: string | null | undefined): ExerciseDef | undefined {
  return id ? CATALOG.find((e) => e.id === id) : undefined;
}
