# Plan

## Principles

1. **Least effort to log.** Voice and camera first, typing never required. Edit later if needed.
2. **Supportive.** Short, kind cues. Lead with what went well. Never shame.
3. **Light.** No video kept anywhere. A set is numbers plus a few small stills.
4. **Typed.** One schema for storage, model output and edits.
5. **Owned.** Runs on your own machine; storage is swappable behind the S3 API.

## Who it serves

- Self-trainers with no coach, or no budget for one.
- People with back issues who want to keep moving safely. Stricter spine review, gentler suggestions,
  clear "see a professional" when pain is mentioned.
- People who want to keep their routine and just get feedback.

## Three layers

| Layer | Runs | Job |
|---|---|---|
| Pose tracking (MediaPipe) | Phone | Joint angles, rep count, tempo, range, live spoken counts and cues |
| Gemini Decision 1 | Server → Google | Calibrated choices: exercise, which registered weight, rubric scores, fault probabilities |
| Anthropic API | Server → Anthropic | The written review, in a fixed typed shape |

Confidence ≥ `AUTO_ACCEPT_CONFIDENCE` (0.85) is logged automatically. Anything lower is shown for a
one-tap check on the review screen.

## Data model

Defined in `packages/core/src/schema.ts`: `Profile`, `Equipment`, `SetDraft`, `SetRecord`, `RepMetrics`,
`Decisions`, `Review`, `Fault`, `Correction`.

## Learning loop

- Every edit to a guessed field is stored as a `Correction` and fed into later reviews.
- Recent faults per exercise are fed back so the review tracks progress ("rounding is less than last week").
- History shows recurring cues to keep working on.
- Next: personal baselines (your usual torso angle, range and tempo per exercise) so live cues compare
  you to yourself.

## Milestones

- [x] **M1 Capture.** Camera, on-device pose, rep counter, voice logging, spoken counts, keyframes,
      save to S3-compatible storage, on-screen review with in-place edits.
- [x] **M2 Review.** Gemini Decision classification and scoring, typed coaching review, confirmation flags.
- [ ] **M3 Learning.** Personal baselines, progression suggestions (add weight when every rep is easy),
      eval set from real labelled sets.
- [ ] **M4 MCP server.** Expose history, fault trends and progression as tools so any assistant on the
      desktop can analyse training data or plan the next week.
- [ ] **M5 Read the weight from the camera.** Plate and dumbbell markings, so weight needs no input at all.
- [ ] **M6 Weekly summary.** Spoken and on-screen.

## Evaluation

The first labelled sets (filmed at home, kept out of the repo): 10 bent-over rows, 11 front-view and
4 side-view kettlebell swings, 10 dumbbell swings. Any change to the rep counter, prompts or
thresholds must keep these counts and the main faults right.

## Open questions

- Speech recognition quality varies by browser; a server-side fallback (local Whisper on the host)
  may be needed for noisy gyms.
- Gemini Decision 1 is new. Its request/response shape is isolated in `apps/web/lib/server/decisions.ts`.
