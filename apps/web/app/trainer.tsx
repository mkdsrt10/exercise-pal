"use client";

import {
  CATALOG,
  computeFeatures,
  findExercise,
  liveCue,
  parseVoiceLog,
  RepCounter,
  setDoneLine,
  type Profile,
  type SetDraft,
  type SetRecord,
  type VoiceLog,
} from "@exercise-pal/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyframeBuffer } from "@/lib/client/keyframes";
import { loadPose } from "@/lib/client/pose";
import { listen, say, speechSupported } from "@/lib/client/speech";
import ReviewCard from "./review-card";

type Phase = "ready" | "active" | "saving" | "reviewing" | "done";

/** Stop on its own after this long without a rep, once at least one rep is in. */
const AUTO_STOP_MS = 12_000;

export default function Trainer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const counterRef = useRef(new RepCounter());
  const framesRef = useRef(new KeyframeBuffer());
  const voiceRef = useRef<VoiceLog>({});
  const transcriptRef = useRef<string[]>([]);
  const startedAtRef = useRef<string>("");
  const lastRepAtRef = useRef(0);
  const phaseRef = useRef<Phase>("ready");
  const profileRef = useRef<Profile | null>(null);

  const [phase, setPhaseState] = useState<Phase>("ready");
  const [count, setCount] = useState(0);
  const [heard, setHeard] = useState<string>("");
  const [voice, setVoice] = useState<VoiceLog>({});
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const [poseReady, setPoseReady] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [fileMode, setFileMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<SetRecord | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const speak = (text: string, opts?: Parameters<typeof say>[1]) => {
    if (profileRef.current?.voiceFeedback !== false) say(text, opts);
  };

  useEffect(() => {
    setCanListen(speechSupported());
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p: Profile) => (profileRef.current = p))
      .catch(() => {});
    loadPose()
      .then(() => setPoseReady(true))
      .catch((e) => setError(`Pose model failed to load: ${e}`));
  }, []);

  // Camera
  useEffect(() => {
    if (fileMode) return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
      })
      .catch(() => setError("Camera not available. Open this page over HTTPS (Tailscale) and allow the camera."));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [facing, fileMode]);

  const start = useCallback(() => {
    if (phaseRef.current === "active") return;
    counterRef.current = new RepCounter();
    framesRef.current.clear();
    transcriptRef.current = [];
    voiceRef.current = {};
    setVoice({});
    setCount(0);
    setRecord(null);
    setNotes(null);
    startedAtRef.current = new Date().toISOString();
    lastRepAtRef.current = performance.now();
    setPhase("active");
    speak("Go.", { interrupt: true });
  }, []);

  const stop = useCallback(async () => {
    if (phaseRef.current !== "active") return;
    setPhase("saving");
    const counter = counterRef.current;
    const v = voiceRef.current;
    const video = videoRef.current;
    if (video) await framesRef.current.capture(video, performance.now());

    const exercise = findExercise(v.exerciseId);
    const reps = v.reps ?? counter.count;
    const draft: SetDraft = {
      exerciseId: v.exerciseId ?? null,
      equipmentId: null,
      weightKg: v.weightKg ?? null,
      weightIsTotal: v.weightIsTotal ?? true,
      reps,
      repsSource: v.reps !== undefined ? "voice" : "pose",
      weightSource: v.weightKg !== undefined ? "voice" : "default",
      exerciseSource: v.exerciseId ? "voice" : "default",
      rpe: v.rpe ?? null,
      transcript: transcriptRef.current.join(" · "),
      repMetrics: counter.reps,
      startedAt: startedAtRef.current,
      endedAt: new Date().toISOString(),
      device: /Mobi|Android|iPhone/.test(navigator.userAgent) ? "phone" : "desktop",
    };
    speak(setDoneLine(reps, draft.weightKg, exercise?.name ?? null), { interrupt: true });

    try {
      const form = new FormData();
      form.set("draft", JSON.stringify(draft));
      framesRef.current.blobs.forEach((b, i) => form.append("keyframe", b, `kf-${i}.jpg`));
      const saved = (await (await fetch("/api/sets", { method: "POST", body: form })).json()) as SetRecord;
      setRecord(saved);
      framesRef.current.clear(); // free memory as soon as frames are uploaded
      setPhase("reviewing");

      const res = (await (await fetch(`/api/sets/${saved.id}/review`, { method: "POST" })).json()) as {
        set: SetRecord;
        errors: { decisions: string | null; review: string | null };
      };
      setRecord(res.set);
      const errs = [res.errors.decisions, res.errors.review].filter(Boolean);
      if (errs.length) setNotes(`Review partly unavailable: ${errs.join(" | ")}`);
      const r = res.set.review;
      if (r) speak([r.summary, ...r.spokenCues].join(" "));
      setPhase("done");
    } catch (e) {
      setError(`Could not save the set: ${e}`);
      setPhase("ready");
    }
  }, []);

  // Voice: always listening once enabled; commands and numbers can be said any time.
  const enableVoice = useCallback(() => {
    if (listening || !canListen) return;
    setListening(true);
    listen((text) => {
      setHeard(text);
      const parsed = parseVoiceLog(text);
      if (parsed.command === "start") start();
      else if (parsed.command === "stop") void stop();
      const { command: _c, ...fields } = parsed;
      if (Object.keys(fields).length) {
        voiceRef.current = { ...voiceRef.current, ...fields };
        setVoice(voiceRef.current);
      }
      if (phaseRef.current === "active" || Object.keys(fields).length) transcriptRef.current.push(text);
    });
  }, [listening, canListen, start, stop]);

  // Pose loop: runs every animation frame, keeps no video.
  useEffect(() => {
    if (!poseReady) return;
    let raf = 0;
    let lastTs = -1;
    let lastCueAt = 0;
    const tick = async () => {
      raf = requestAnimationFrame(() => void tick());
      const video = videoRef.current;
      if (!video || video.readyState < 2 || phaseRef.current !== "active") return;
      const now = performance.now();
      if (now <= lastTs) return;
      lastTs = now;
      const pose = await loadPose();
      const result = pose.detectForVideo(video, now);
      const lm = result.landmarks[0];
      const aspect = video.videoWidth / Math.max(1, video.videoHeight);
      const t = fileMode ? video.currentTime * 1000 : now;
      const counter = counterRef.current;
      for (const e of counter.update(t, lm ? computeFeatures(lm, aspect) : null)) {
        if (e.type === "turn") void framesRef.current.capture(video, t);
        if (e.type === "rep") {
          lastRepAtRef.current = now;
          setCount(counter.count);
          const cue = now - lastCueAt > 8000 ? liveCue(e.rep, counter.reps.slice(0, -1)) : null;
          if (cue) {
            lastCueAt = now;
            speak(`${counter.count}. ${cue}`, { interrupt: true });
          } else {
            speak(String(counter.count), { interrupt: true });
          }
        }
      }
      if (counter.count > 0 && now - lastRepAtRef.current > AUTO_STOP_MS) void stop();
    };
    void tick();
    return () => cancelAnimationFrame(raf);
  }, [poseReady, fileMode, stop]);

  // Desktop / existing clip: the file plays locally and is never uploaded.
  const onFile = (f: File | undefined) => {
    const video = videoRef.current;
    if (!f || !video) return;
    setFileMode(true);
    video.srcObject = null;
    video.src = URL.createObjectURL(f);
    video.muted = true;
    video.onended = () => void stop();
    video.onloadeddata = () => {
      start();
      void video.play();
    };
  };

  const ex = findExercise(voice.exerciseId);
  const hint =
    phase === "active"
      ? 'Training. Say "done" when finished, or just rest and I will stop.'
      : phase === "saving"
        ? "Saving…"
        : phase === "reviewing"
          ? "Reviewing your form…"
          : listening
            ? 'Say "start", or tell me the weight first: "dumbbells, 10 kilos each, rows".'
            : "Tap Start, or turn on voice to go hands-free.";

  return (
    <>
      <div className={`stage ${facing === "user" && !fileMode ? "mirror" : ""}`}>
        <video ref={videoRef} playsInline muted />
        {phase === "active" && <div className="count">{count}</div>}
        <div className="hint">{hint}</div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        {phase === "active" ? (
          <button className="primary" onClick={() => void stop()}>
            Done
          </button>
        ) : (
          <button className="primary" onClick={start} disabled={!poseReady || phase === "saving" || phase === "reviewing"}>
            {poseReady ? "Start" : "Loading…"}
          </button>
        )}
        {canListen && !listening &&<button onClick={enableVoice}>Turn on voice</button>}
        {!fileMode && (
          <button onClick={() => setFacing(facing === "user" ? "environment" : "user")}>Flip camera</button>
        )}
        <label className="button" style={{ margin: 0, color: "var(--text)" }}>
          Use a clip
          <input type="file" accept="video/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>

      {(heard || Object.keys(voice).length > 0) && (
        <div className="chips">
          {heard && <span className="chip muted">“{heard}”</span>}
          {ex && <span className="chip">{ex.name}</span>}
          {voice.weightKg !== undefined && (
            <span className="chip">
              {voice.weightKg} kg {voice.weightIsTotal === false ? "each" : ""}
            </span>
          )}
          {voice.reps !== undefined && <span className="chip">{voice.reps} reps</span>}
          {voice.equipmentKind && <span className="chip">{voice.equipmentKind}</span>}
        </div>
      )}

      {error && <p style={{ color: "var(--bad)" }}>{error}</p>}
      {notes && <p className="muted">{notes}</p>}
      {record && <ReviewCard record={record} catalog={CATALOG} onChange={setRecord} />}
    </>
  );
}
