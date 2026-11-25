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

4. Expose it on your tailnet:

   ```bash
   tailscale serve --bg 3000
   tailscale serve status   # shows the https://… address
   ```

5. On your phone (signed in to the same tailnet), open the address and *Add to Home Screen*.

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
