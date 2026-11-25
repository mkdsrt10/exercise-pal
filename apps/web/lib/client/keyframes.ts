"use client";

/**
 * Keeps at most `max` small JPEG stills per set instead of recording video.
 * Frames are taken at the turn of each rep (bottom of a swing, top of a row),
 * where form faults show. When the buffer is full, frames are thinned evenly,
 * so the set's first, middle and last reps stay represented.
 * Memory: about 25 KB per frame, so ~200 KB per set at most.
 */
export class KeyframeBuffer {
  private frames: { t: number; blob: Blob }[] = [];
  private canvas: HTMLCanvasElement | null = null;

  constructor(
    private readonly max = 8,
    private readonly width = 512,
  ) {}

  async capture(video: HTMLVideoElement, t: number) {
    if (!video.videoWidth) return;
    this.canvas ??= document.createElement("canvas");
    const scale = this.width / video.videoWidth;
    this.canvas.width = this.width;
    this.canvas.height = Math.round(video.videoHeight * scale);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    const blob = await new Promise<Blob | null>((r) => this.canvas!.toBlob(r, "image/jpeg", 0.7));
    if (!blob) return;
    this.frames.push({ t, blob });
    if (this.frames.length > this.max) {
      // Drop the frame whose neighbours are closest together in time.
      let drop = 1;
      let best = Infinity;
      for (let i = 1; i < this.frames.length - 1; i++) {
        const gap = this.frames[i + 1]!.t - this.frames[i - 1]!.t;
        if (gap < best) {
          best = gap;
          drop = i;
        }
      }
      this.frames.splice(drop, 1);
    }
  }

  get blobs(): Blob[] {
    return this.frames.map((f) => f.blob);
  }

  clear() {
    this.frames = [];
  }
}
