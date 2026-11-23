export interface FrameStats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  gcSpikeCount: number;
}

/**
 * Ring-buffer frame timing collector computing p50 / p95 / p99 frame latencies
 * without dynamic array growth during gameplay.
 */
export class FrameProfiler {
  private readonly samples: Float64Array;
  private readonly sortedScratch: Float64Array;
  private cursor = 0;
  private filled = 0;
  private gcSpikes = 0;

  constructor(capacity = 1800, private readonly spikeThresholdMs = 16.7) {
    this.samples = new Float64Array(capacity);
    this.sortedScratch = new Float64Array(capacity);
  }

  record(frameMs: number): void {
    this.samples[this.cursor] = frameMs;
    this.cursor = (this.cursor + 1) % this.samples.length;
    if (this.filled < this.samples.length) {
      this.filled++;
    }
    if (frameMs > this.spikeThresholdMs) {
      this.gcSpikes++;
    }
  }

  computeStats(): FrameStats {
    if (this.filled === 0) {
      return { count: 0, p50: 0, p95: 0, p99: 0, gcSpikeCount: 0 };
    }
    const slice = this.sortedScratch.subarray(0, this.filled);
    for (let i = 0; i < this.filled; i++) {
      slice[i] = this.samples[i]!;
    }
    slice.sort();

    const idx50 = Math.min(this.filled - 1, Math.floor(this.filled * 0.5));
    const idx95 = Math.min(this.filled - 1, Math.floor(this.filled * 0.95));
    const idx99 = Math.min(this.filled - 1, Math.floor(this.filled * 0.99));

    return {
      count: this.filled,
      p50: slice[idx50]!,
      p95: slice[idx95]!,
      p99: slice[idx99]!,
      gcSpikeCount: this.gcSpikes,
    };
  }
}
