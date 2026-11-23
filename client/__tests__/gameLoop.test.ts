import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameLoop } from '../src/gameLoop';

describe('GameLoop with Vitest fake timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws if fixedDtSec is zero or negative', () => {
    expect(() => new GameLoop(0, { update: () => {}, render: () => {} })).toThrow();
  });

  it('executes deterministic fixed updates as fake time advances', () => {
    let updates = 0;
    let renders = 0;
    const loop = new GameLoop(
      0.02, // 50 Hz (20ms)
      {
        update: () => updates++,
        render: () => renders++,
      },
      () => Date.now()
    );

    loop.start();
    expect(loop.isRunning).toBe(true);

    vi.advanceTimersByTime(100); // 5 ticks of 20ms
    expect(updates).toBe(5);
    expect(renders).toBe(5);
    expect(loop.ticksExecuted).toBe(5);

    loop.stop();
    expect(loop.isRunning).toBe(false);
  });

  it('stops advancing ticks once stop() is called', () => {
    let updates = 0;
    const loop = new GameLoop(0.02, { update: () => updates++, render: () => {} }, () => Date.now());

    loop.start();
    vi.advanceTimersByTime(60);
    expect(updates).toBe(3);

    loop.stop();
    vi.advanceTimersByTime(200);
    expect(updates).toBe(3);
  });

  it('clamps huge frame spikes via maxFrameDeltaSec to prevent spiral of death', () => {
    let updates = 0;
    const loop = new GameLoop(
      0.02,
      { update: () => updates++, render: () => {} },
      () => Date.now(),
      0.1 // clamp any stall to 100ms = max 5 updates
    );

    loop.start();
    // Simulate a 2-second tab freeze by jumping system time directly and stepping once
    vi.setSystemTime(Date.now() + 2000);
    loop.stepFrame();

    expect(updates).toBe(5);
    loop.stop();
  });

  it('passes normalized interpolation alpha in [0, 1) to render callback', () => {
    const alphas: number[] = [];
    const loop = new GameLoop(
      0.02,
      {
        update: () => {},
        render: (a) => alphas.push(a),
      },
      () => Date.now()
    );

    loop.start();
    vi.setSystemTime(Date.now() + 30); // 1.5 steps -> 1 update, 0.5 remainder
    loop.stepFrame();

    expect(alphas[0]).toBeCloseTo(0.5, 5);
    loop.stop();
  });

  it('is idempotent when start() or stop() is called repeatedly', () => {
    let updates = 0;
    const loop = new GameLoop(0.02, { update: () => updates++, render: () => {} }, () => Date.now());

    loop.start();
    loop.start();
    vi.advanceTimersByTime(40);
    expect(updates).toBe(2);

    loop.stop();
    loop.stop();
    expect(loop.isRunning).toBe(false);
  });
});
