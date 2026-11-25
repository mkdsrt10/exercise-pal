"use client";

import { EquipmentKind, type Equipment, type Profile } from "@exercise-pal/core";
import { useEffect, useState } from "react";

const KINDS = EquipmentKind.options;

export default function MePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then(setP);
  }, []);

  if (!p) return <p className="muted">Loading…</p>;

  const update = (next: Partial<Profile>) => {
    setSaved(false);
    setP({ ...p, ...next });
  };
  const setEq = (i: number, next: Partial<Equipment>) =>
    update({ equipment: p.equipment.map((e, j) => (j === i ? { ...e, ...next } : e)) });

  const save = async () => {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    setSaved(res.ok);
  };

  return (
    <>
      <h1>Me</h1>

      <section className="panel">
        <h3>Your weights</h3>
        <p className="muted">Add each weight once. After that the camera can tell which one you picked up.</p>
        {p.equipment.map((e, i) => (
          <div className="row" key={e.id} style={{ marginBottom: 8 }}>
            <select value={e.kind} onChange={(ev) => setEq(i, { kind: ev.target.value as Equipment["kind"] })} style={{ flex: 2 }}>
              {KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.5"
              inputMode="decimal"
              value={e.weightKg}
              onChange={(ev) => setEq(i, { weightKg: Number(ev.target.value) })}
              style={{ flex: 1 }}
              aria-label="Weight in kg"
            />
            <input
              placeholder="Label (e.g. black hex)"
              value={e.label ?? ""}
              onChange={(ev) => setEq(i, { label: ev.target.value })}
              style={{ flex: 2 }}
            />
            <button onClick={() => update({ equipment: p.equipment.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <button
          onClick={() =>
            update({ equipment: [...p.equipment, { id: crypto.randomUUID(), kind: "dumbbell", weightKg: 5 }] })
          }
        >
          Add a weight
        </button>
      </section>

      <section className="panel">
        <h3>About you</h3>
        <label className="row" style={{ color: "var(--text)" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={p.backSensitive}
            onChange={(e) => update({ backSensitive: e.target.checked })}
          />
          I have a sensitive back or a past back injury
        </label>
        <p className="muted" style={{ fontSize: 14 }}>
          Reviews will treat back rounding as the top priority and suggest gentler options. This is not medical
          advice. If something hurts, stop and check with a physiotherapist or doctor.
        </p>
        <label className="row" style={{ color: "var(--text)" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={p.voiceFeedback}
            onChange={(e) => update({ voiceFeedback: e.target.checked })}
          />
          Talk to me (count reps and read cues out loud)
        </label>
        <label>Anything I should know?</label>
        <textarea rows={3} value={p.notes} onChange={(e) => update({ notes: e.target.value })} />
      </section>

      <div className="row">
        <button className="primary" onClick={() => void save()}>
          Save
        </button>
        {saved && <span className="muted">Saved</span>}
      </div>
    </>
  );
}
