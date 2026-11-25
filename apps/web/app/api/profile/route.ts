import { Profile } from "@exercise-pal/core";
import { getProfile, saveProfile } from "@/lib/server/store";
import { currentUser } from "@/lib/server/user";

export async function GET() {
  return Response.json(await getProfile(await currentUser()));
}

export async function PUT(req: Request) {
  const parsed = Profile.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  await saveProfile(await currentUser(), parsed.data);
  return Response.json(parsed.data);
}
