export interface GameLoopCallbacks {
  update: (fixedDt: number) => void;
  render: (alpha: number) => void;
  onFrameMetric?: (frameDurationMs: number) => void;
}

/**
 * Fixed-timestep accumulator game loop designed for deterministic stepping
 * and testability with Vitest fake timers.
 */
export class GameLoop {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private accumulator = 0;
  private lastTimeMs = 0;
  private running = false;
  private totalTicks = 0;

  constructor(
    private readonly fixedDtSec: number,
    private readonly callbacks: GameLoopCallbacks,
    private readonly nowFn: () => number = () => Date.now(),
    private readonly maxFrameDeltaSec = 0.25
  ) {
    if (fixedDtSec <= 0) {
      throw new Error('fixedDtSec must be positive');
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  get ticksExecuted(): number {
    return this.totalTicks;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimeMs = this.nowFn();
    this.accumulator = 0;

    const intervalMs = Math.max(1, Math.round(this.fixedDtSec * 1000));
    this.timerId = setInterval(() => {
      this.stepFrame();
    }, intervalMs);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  stepFrame(): void {
    const startMs = this.nowFn();
    const rawDeltaSec = Math.max(0, (startMs - this.lastTimeMs) / 1000);
    this.lastTimeMs = startMs;

    const clampedDelta = Math.min(rawDeltaSec, this.maxFrameDeltaSec);
    this.accumulator += clampedDelta;

    while (this.accumulator + 1e-9 >= this.fixedDtSec) {
      this.callbacks.update(this.fixedDtSec);
      this.accumulator -= this.fixedDtSec;
      this.totalTicks++;
    }

    const alpha = this.accumulator / this.fixedDtSec;
    this.callbacks.render(alpha);

    const elapsedMs = this.nowFn() - startMs;
    this.callbacks.onFrameMetric?.(elapsedMs);
  }
}
