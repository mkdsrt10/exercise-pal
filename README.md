# Exercise Pal

A minimal, supportive training buddy. Prop your phone up, say what you're lifting, and train.
Exercise Pal counts your reps, logs the weight, watches your posture and gives you a short,
kind review after every set, out loud and on screen.

**Point the camera. Talk. Train.** No typing during a workout.

## Who it's for

- **People who train on their own**, at home or in a quiet corner of the gym, and want a second pair of eyes.
- **People without access to a good trainer**, or who can't afford one every session.
- **People with a sensitive back** (or a past back injury) who want to keep exercising without
  drifting into the positions that hurt them. Turn on *sensitive back* and every review puts spine
  position first and suggests gentler options. *Exercise Pal is not medical advice. If something hurts, stop
  and see a physiotherapist or doctor.*
- **People who don't want a whole new routine.** Keep doing what you do; Exercise Pal just keeps track and
  nudges your form.

## What it does

| You do | Exercise Pal does |
|---|---|
| Say *"dumbbells, seven and a half each, rows"* | Logs exercise, equipment and weight from your voice |
| Say *"start"* (or tap) | Starts counting reps from the camera, speaks each count |
| Train | Watches joint angles on the device, cues you if reps get rushed or short |
| Rest, or say *"done"* | Stops on its own, saves the set, reads you a short review |
| Glance at the screen | Sees the review, keyframes and anything it wasn't sure about, editable in place |

Weights you register once on the **Me** tab can be recognised by the camera, so most sets need no input at all.
Anything the app guessed with low confidence is highlighted for a one-tap check. Every correction you make is
saved and used to make the next guess better.

## How it works

```
Phone camera ──► pose tracking on the phone (MediaPipe) ──► rep counter + joint angles
     │                                                         │
     └─ voice ──► speech-to-text in the browser ──► parsed log │
                                                               ▼
                         few small keyframes + numbers (no video) ──► your server
                                                                         │
             Gemini Decision 1: which exercise / which weight / form scores, with confidence
             Anthropic API:     supportive review in a fixed, typed shape
                                                                         │
                                         S3-compatible storage (MinIO) ◄─┘
```

- **Memory light.** Video is never recorded or uploaded. Pose runs frame by frame on the device and only
  keeps a few seconds of joint angles. Each set keeps at most 8 small JPEG keyframes (~25 KB each).
  Clips you load from your gallery play locally and are never uploaded either.
- **Typed end to end.** One schema package (`packages/core`, Zod) defines every stored record and every
  model response. A response that doesn't match is rejected, not stored.
- **Calibrated, not guessed.** Gemini Decision 1 returns probabilities, so confident answers are logged
  automatically and unsure ones are asked about.
- **Swappable storage.** Everything goes through the S3 API. MinIO by default; point the `S3_*` settings at
  any S3-compatible store to move.
- **Learns from you.** Corrections and your recent fault history are fed into each review.

## Run it

```bash
cp .env.example .env        # add your API keys
docker compose up -d --build  # MinIO + the app on localhost
tailscale serve --bg 3000   # HTTPS on your tailnet, so the phone camera works
```

Open `https://<your-machine>.<tailnet>.ts.net` on your phone and add it to the home screen.
See [docs/HOSTING.md](docs/HOSTING.md) for details and [docs/PLAN.md](docs/PLAN.md) for the roadmap.

### Develop

```bash
npm install
npm test          # rep counter, voice parser, geometry
npm run dev       # http://localhost:3000 (camera works on localhost)
```

## Repo layout

```
packages/core   schema, exercise catalog, pose geometry, rep counter, voice parser, spoken lines
apps/web        Next.js app: camera + voice UI, API routes, storage, model adapters
docs/           plan and hosting notes
```

## License

MIT
