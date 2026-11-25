"use client";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let instance: Promise<PoseLandmarker> | null = null;

/** Loads the on-device pose model once. Runs on the GPU when available. */
export function loadPose(): Promise<PoseLandmarker> {
  instance ??= (async () => {
    const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const make = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      });
    try {
      return await make("GPU");
    } catch {
      return make("CPU");
    }
  })();
  return instance;
}
