import { findExercise } from "@exercise-pal/core";
import { listSets } from "@/lib/server/store";
import { currentUser } from "@/lib/server/user";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const sets = await listSets(await currentUser(), 100);

  // Recurring faults across recent sets: what to keep an eye on.
  const counts = new Map<string, number>();
  for (const s of sets.slice(0, 20)) for (const f of s.review?.faults ?? []) counts.set(f.cue, (counts.get(f.cue) ?? 0) + 1);
  const recurring = [...counts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <>
      <h1>History</h1>
      {recurring.length > 0 && (
        <section className="panel">
          <h3>Keep working on</h3>
          <ul>
            {recurring.map(([cue, n]) => (
              <li key={cue}>
                {cue} <span className="muted">({n} recent sets)</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sets.length === 0 && <p className="muted">No sets yet. Your first one will show up here.</p>}
      <ul className="list">
        {sets.map((s) => (
          <li key={s.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{findExercise(s.exerciseId)?.name ?? "Unlabelled set"}</strong>
              <span className="muted">{new Date(s.startedAt).toLocaleString()}</span>
            </div>
            <div>
              {s.reps} reps
              {s.weightKg !== null && ` · ${s.weightKg} kg ${s.weightIsTotal ? "total" : "each"}`}
              {s.rpe !== null && ` · RPE ${s.rpe}`}
            </div>
            {s.review?.faults[0] && <div className="muted">{s.review.faults[0].cue}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}
