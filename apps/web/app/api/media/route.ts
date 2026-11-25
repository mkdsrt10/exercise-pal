import { getObjectBytes } from "@/lib/server/store";
import { currentUser } from "@/lib/server/user";

/** Serves a keyframe, only from the caller's own prefix. */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const userId = await currentUser();
  if (!key.startsWith(`users/${encodeURIComponent(userId)}/media/`) || key.includes("..")) {
    return new Response("forbidden", { status: 403 });
  }
  const bytes = await getObjectBytes(key);
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  });
}
