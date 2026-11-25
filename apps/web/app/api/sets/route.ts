import { SetDraft, type SetRecord } from "@exercise-pal/core";
import { listSets, putKeyframe, saveSet } from "@/lib/server/store";
import { currentUser } from "@/lib/server/user";

const MAX_KEYFRAMES = 8;
const MAX_KEYFRAME_BYTES = 300_000;

export async function GET() {
  return Response.json(await listSets(await currentUser()));
}

/** multipart/form-data: `draft` (JSON) + up to 8 `keyframe` JPEGs. */
export async function POST(req: Request) {
  const userId = await currentUser();
  const form = await req.formData();
  const parsed = SetDraft.safeParse(JSON.parse(String(form.get("draft") ?? "{}")));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });

  const id = crypto.randomUUID();
  const files = form.getAll("keyframe").filter((f): f is File => f instanceof File).slice(0, MAX_KEYFRAMES);
  const keyframeKeys: string[] = [];
  for (const [i, f] of files.entries()) {
    if (f.type !== "image/jpeg" || f.size > MAX_KEYFRAME_BYTES) continue;
    keyframeKeys.push(await putKeyframe(userId, id, i, new Uint8Array(await f.arrayBuffer())));
  }

  const record: SetRecord = {
    ...parsed.data,
    id,
    userId,
    keyframeKeys,
    needsConfirmation: [],
    updatedAt: new Date().toISOString(),
  };
  await saveSet(record);
  return Response.json(record, { status: 201 });
}
