"use client";

import type { ExerciseDef, SetPatch, SetRecord } from "@exercise-pal/core";
import { useState } from "react";

/** On-screen review. Anything the app guessed is editable in place; edits teach it. */
export default function ReviewCard({
  record,
  catalog,
  onChange,
}: {
  record: SetRecord;
  catalog: ExerciseDef[];
  onChange: (r: SetRecord) => void;
}) {
  const [saving, setSaving] = useState(false);
  const confirm = (f: SetRecord["needsConfirmation"][number]) => record.needsConfirmation.includes(f);

  const patch = async (p: SetPatch) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/sets/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (res.ok) onChange((await res.json()) as SetRecord);
    } finally {
      setSaving(false);
    }
  };

  const r = record.review;

  return (
    <section className="panel">
      <h2>This set</h2>
      <div className="row">
        <div style={{ flex: 2, minWidth: 160 }}>
          <label className={confirm("exercise") ? "confirm" : ""}>
            Exercise {confirm("exercise") && "· please check"}
          </label>
          <select
            value={record.exerciseId ?? ""}
            onChange={(e) => void patch({ exerciseId: e.target.value || null })}
            disabled={saving}
          >
            <option value="">Not sure</option>
            {catalog.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 90 }}>
          <label className={confirm("weight") || confirm("equipment") ? "confirm" : ""}>
            kg {record.weightIsTotal ? "total" : "each"}
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            defaultValue={record.weightKg ?? ""}
            onBlur={(e) => void patch({ weightKg: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
        <div style={{ flex: 1, minWidth: 70 }}>
          <label>Reps</label>
          <input
            type="number"
            inputMode="numeric"
            defaultValue={record.reps}
            onBlur={(e) => void patch({ reps: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={() => void patch({ weightIsTotal: !record.weightIsTotal })} disabled={saving}>
          Weight is {record.weightIsTotal ? "total" : "per hand"}
        </button>
        <span className="muted" style={{ fontSize: 14 }}>
          reps from {record.repsSource}, weight from {record.weightSource}
        </span>
      </div>

      {record.keyframeKeys.length > 0 && (
        <div className="thumbs" style={{ marginTop: 12 }}>
          {record.keyframeKeys.map((k) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={k} src={`/api/media?key=${encodeURIComponent(k)}`} alt="Keyframe from this set" />
          ))}
        </div>
      )}

      {r ? (
        <div style={{ marginTop: 12 }}>
          <p>{r.summary}</p>
          {r.wentWell.length > 0 && (
            <>
              <h3>Going well</h3>
              <ul>
                {r.wentWell.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          )}
          {r.faults.length > 0 && <h3>To work on</h3>}
          {r.faults.map((f) => (
            <div key={f.code + f.cue} className={`fault ${f.severity}`}>
              <strong>{f.cue}</strong>
              <div className="muted">{f.evidence}</div>
            </div>
          ))}
          <p>
            <strong>Next time:</strong> {r.nextTime}
          </p>
          {r.safetyNote && <div className="safety">{r.safetyNote}</div>}
        </div>
      ) : (
        <p className="muted">Review will appear here.</p>
      )}
    </section>
  );
}
