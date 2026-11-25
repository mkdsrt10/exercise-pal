import { SetPatch, type Correction, type SetRecord } from "@exercise-pal/core";
import { getSet, saveCorrection, saveSet } from "@/lib/server/store";
import { currentUser } from "@/lib/server/user";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const set = await getSet(await currentUser(), (await params).id);
  return set ? Response.json(set) : Response.json({ error: "not found" }, { status: 404 });
}

/** User edits. Every change to a guessed value is saved as a Correction for learning. */
export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await currentUser();
  const set = await getSet(userId, (await params).id);
  if (!set) return Response.json({ error: "not found" }, { status: 404 });
  const patch = SetPatch.safeParse(await req.json());
  if (!patch.success) return Response.json({ error: patch.error.issues }, { status: 400 });

  const fieldMap = { exerciseId: "exercise", equipmentId: "equipment", weightKg: "weight", reps: "reps" } as const;
  const updated: SetRecord = { ...set, ...patch.data, updatedAt: new Date().toISOString() };
  const now = new Date().toISOString();

  for (const [k, field] of Object.entries(fieldMap) as [keyof typeof fieldMap, Correction["field"]][]) {
    if (!(k in patch.data)) continue;
    const before = set[k];
    const after = patch.data[k];
    if (String(before ?? "") === String(after ?? "")) continue;
    await saveCorrection(userId, {
      id: crypto.randomUUID(),
      setId: set.id,
      field,
      predicted: before === null || before === undefined ? null : String(before),
      actual: after === null || after === undefined ? null : String(after),
      at: now,
    });
    updated.needsConfirmation = updated.needsConfirmation.filter((n) => n !== field);
    if (field === "exercise") updated.exerciseSource = "user_edit";
    if (field === "weight") updated.weightSource = "user_edit";
    if (field === "reps") updated.repsSource = "user_edit";
  }

  await saveSet(updated);
  return Response.json(updated);
}
