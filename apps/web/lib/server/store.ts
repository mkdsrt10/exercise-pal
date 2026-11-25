import "server-only";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { Profile, SetRecord, type Correction } from "@exercise-pal/core";

/**
 * All persistence goes through the S3 API. MinIO by default; point the S3_*
 * env vars at AWS S3, R2, Garage or SeaweedFS to swap it without code changes.
 *
 * Layout (one prefix per user):
 *   users/{u}/profile.json
 *   users/{u}/sets/{yyyy-mm-dd}/{setId}.json
 *   users/{u}/media/{setId}/kf-{n}.jpg
 *   users/{u}/corrections/{iso}-{id}.json
 */

const bucket = process.env.S3_BUCKET ?? "exercise-pal";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || undefined,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  credentials:
    process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
      ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY }
      : undefined,
});

/** Creates the bucket on first use, so no store-specific setup tool is needed. */
let ready: Promise<void> | null = null;
function ensureBucket(): Promise<void> {
  ready ??= s3
    .send(new HeadBucketCommand({ Bucket: bucket }))
    .then(() => undefined)
    .catch(async (e: { name?: string; $metadata?: { httpStatusCode?: number } }) => {
      if (e.name !== "NotFound" && e.$metadata?.httpStatusCode !== 404) throw e;
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    })
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

const send: S3Client["send"] = (async (cmd: Parameters<S3Client["send"]>[0]) => {
  await ensureBucket();
  return s3.send(cmd as never);
}) as S3Client["send"];

const userPrefix = (userId: string) => `users/${encodeURIComponent(userId)}`;

async function putJson(key: string, value: unknown) {
  await send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: JSON.stringify(value), ContentType: "application/json" }),
  );
}

async function getJson(key: string): Promise<unknown | null> {
  try {
    const res = await send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return JSON.parse(await res.Body!.transformToString());
  } catch (e) {
    if ((e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}

async function listKeys(prefix: string, max = 1000): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res: ListObjectsV2CommandOutput = await send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token && keys.length < max);
  return keys;
}

export async function getProfile(userId: string): Promise<Profile> {
  return Profile.parse((await getJson(`${userPrefix(userId)}/profile.json`)) ?? {});
}

export async function saveProfile(userId: string, profile: Profile) {
  await putJson(`${userPrefix(userId)}/profile.json`, Profile.parse(profile));
}

const setKey = (r: { userId: string; id: string; startedAt: string }) =>
  `${userPrefix(r.userId)}/sets/${r.startedAt.slice(0, 10)}/${r.id}.json`;

export async function saveSet(record: SetRecord) {
  await putJson(setKey(record), SetRecord.parse(record));
}

export async function getSet(userId: string, id: string): Promise<SetRecord | null> {
  const key = (await listKeys(`${userPrefix(userId)}/sets/`)).find((k) => k.endsWith(`/${id}.json`));
  if (!key) return null;
  const raw = await getJson(key);
  return raw ? SetRecord.parse(raw) : null;
}

/** Newest first. Keys sort by date, so this stays cheap for a personal history. */
export async function listSets(userId: string, limit = 50): Promise<SetRecord[]> {
  const keys = (await listKeys(`${userPrefix(userId)}/sets/`)).sort().reverse().slice(0, limit);
  const rows = await Promise.all(keys.map(getJson));
  return rows
    .map((r) => SetRecord.safeParse(r))
    .filter((r) => r.success)
    .map((r) => r.data)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function putKeyframe(userId: string, setId: string, n: number, jpeg: Uint8Array): Promise<string> {
  const key = `${userPrefix(userId)}/media/${setId}/kf-${n}.jpg`;
  await send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: jpeg, ContentType: "image/jpeg" }));
  return key;
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return res.Body!.transformToByteArray();
}

export async function saveCorrection(userId: string, c: Correction) {
  await putJson(`${userPrefix(userId)}/corrections/${c.at}-${c.id}.json`, c);
}

export async function recentCorrections(userId: string, limit = 20): Promise<Correction[]> {
  const keys = (await listKeys(`${userPrefix(userId)}/corrections/`)).sort().reverse().slice(0, limit);
  return (await Promise.all(keys.map(getJson))) as Correction[];
}
