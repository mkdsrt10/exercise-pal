// Copies the MediaPipe WASM runtime into /public so pose tracking is served
// from the app itself and always matches the installed package version.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  join(here, "..", "node_modules", "@mediapipe", "tasks-vision", "wasm"),
  join(here, "..", "..", "..", "node_modules", "@mediapipe", "tasks-vision", "wasm"),
];
const src = candidates.find(existsSync);
if (!src) throw new Error("@mediapipe/tasks-vision is not installed");
const out = join(here, "..", "public", "mediapipe");
mkdirSync(out, { recursive: true });
cpSync(src, join(out, "wasm"), { recursive: true });
console.log("mediapipe wasm ->", out);
