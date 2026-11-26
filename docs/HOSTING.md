# Hosting on your own machine

Exercise Pal is designed to run on one always-on machine at home (a Mac Studio here) and be reached
from your phone over [Tailscale](https://tailscale.com).

## Why Tailscale

- **HTTPS for the camera.** Browsers only allow camera and microphone on secure pages.
  `tailscale serve` gives the app a valid HTTPS certificate on your tailnet with no port forwarding.
- **Private by default.** The app is only reachable from devices signed in to your tailnet.
- **No login screen.** `tailscale serve` passes the signed-in user's login to the app in the
  `Tailscale-User-Login` header. Each tailnet user gets their own data prefix.

## Steps

1. Install Docker (Docker Desktop or `colima`) and Tailscale on the host.
2. Configure:

   ```bash
   cp .env.example .env
   # set ANTHROPIC_API_KEY, GEMINI_API_KEY, and change MINIO_ROOT_PASSWORD / S3_SECRET_KEY
   ```

3. Start the stack:

   ```bash
   docker compose up -d --build
   ```

   This starts MinIO (storage, `localhost:9000`, console on `localhost:9001`) and the app on
   `localhost:3000`. Data lives in `./data/minio`.

   If the Docker VM can't reach the npm registry (`npm ci` times out inside the build), build on the
   host and let Docker only package it:

   ```bash
   npm install && npm run build
   docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml up -d --build
   ```

4. Expose it on your tailnet:

   ```bash
   tailscale serve --bg 3000
   tailscale serve status   # shows the https://… address
   ```

   If port 443 is already serving something else, give Exercise Pal its own HTTPS port. It stays
   tailnet-only unless you turn on Funnel for that port (don't):

   ```bash
   tailscale serve --bg --https=8443 http://127.0.0.1:3000
   # https://<machine>.<tailnet>.ts.net:8443
   ```

5. On your phone (signed in to the same tailnet), open the address and *Add to Home Screen*.

## Choose how reviews are powered

Rep counting, voice logging and history work with no keys at all. The written review after each set
needs one of these (set `COACH_PROVIDER`, or leave it on `auto` to use the first one that's set up):

| Option | What you set | Notes |
|---|---|---|
| **Gemini key only** | `GEMINI_API_KEY` | Simplest: one key runs both the review (`GEMINI_COACH_MODEL`, default `gemini-3.8-flash`) and the decision scoring. |
| **Anthropic login, no key** | Run `ant auth login` on the host once | Uses a short-lived token from your Claude Console account instead of a stored key. Add `docker-compose.host-creds.yml` so the container can see the login. Re-run `ant auth login` if it ever stops working (refresh tokens expire). Billed as normal API usage. |
| **Anthropic API key** | `ANTHROPIC_API_KEY` | |
| **Amazon Bedrock** | `BEDROCK_REGION` + `AWS_PROFILE` (or AWS keys) | Uses your AWS credentials. Add `docker-compose.host-creds.yml` to share `~/.aws` with the container. Model access for `BEDROCK_MODEL` must be enabled in that region. |

The decision scoring (which exercise, which weight, form scores) always uses `GEMINI_API_KEY`. Without
it, the review still runs; you just get fewer automatic guesses.

A Claude.ai / Claude Code subscription login can't be used by the app; `ant auth login` signs in to a
Claude Console organization and bills API usage there.

With host credentials:

```bash
docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml -f docker-compose.host-creds.yml up -d --build
```

## Storage

All reads and writes use the S3 API (`apps/web/lib/server/store.ts`). To move off MinIO, point these
at the new store and copy the bucket across. No code changes.

```
S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_FORCE_PATH_STYLE
```

Works with AWS S3, Cloudflare R2, Garage, SeaweedFS and others.

MinIO no longer publishes public container images and its repository is archived, so
`docker/minio.Dockerfile` builds the last community release (`RELEASE.2025-10-15T17-29-55Z`) from source.
The first `docker compose up --build` takes a few minutes because of that. This is also why the app only
depends on the S3 API: swapping to Garage or SeaweedFS later is a config change. The app creates its
bucket on first use, so no store-specific setup tool is needed.

Object layout:

```
users/{user}/profile.json
users/{user}/sets/{yyyy-mm-dd}/{setId}.json
users/{user}/media/{setId}/kf-{n}.jpg
users/{user}/corrections/{timestamp}-{id}.json
```

## Backups

`./data/minio` is the whole database. Back it up with Time Machine, or mirror the bucket with
`mc mirror` to another S3-compatible store.

## Privacy

Keyframes show your body and sometimes your face. They stay on your machine except when sent to the
review models for a set you just finished. Video is never stored or sent.
