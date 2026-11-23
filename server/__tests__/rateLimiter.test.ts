import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/rateLimiter';

describe('Server RateLimiter (token bucket)', () => {
  it('throws on invalid capacity or refill rate', () => {
    expect(() => new RateLimiter({ capacity: 0, refillPerSec: 10 })).toThrow();
    expect(() => new RateLimiter({ capacity: 10, refillPerSec: 0 })).toThrow();
  });

  it('allows burst traffic up to bucket capacity and blocks excess packets', () => {
    const limiter = new RateLimiter({ capacity: 3, refillPerSec: 1 });
    expect(limiter.consume(1, 1000)).toBe(true);
    expect(limiter.consume(1, 1000)).toBe(true);
    expect(limiter.consume(1, 1000)).toBe(true);
    expect(limiter.consume(1, 1000)).toBe(false);
  });

  it('refills tokens proportionally over elapsed time', () => {
    const limiter = new RateLimiter({ capacity: 5, refillPerSec: 2 });
    for (let i = 0; i < 5; i++) {
      expect(limiter.consume(1, 0)).toBe(true);
    }
    expect(limiter.consume(1, 0)).toBe(false);

    // After 1000ms at 2 tokens/sec -> 2 tokens available
    expect(limiter.consume(1, 1000)).toBe(true);
    expect(limiter.consume(1, 1000)).toBe(true);
    expect(limiter.consume(1, 1000)).toBe(false);
  });

  it('caps accumulated tokens at bucket capacity', () => {
    const limiter = new RateLimiter({ capacity: 2, refillPerSec: 10 });
    expect(limiter.consume(1, 0)).toBe(true);

    // Wait 60 seconds -> should cap at 2, not 601
    expect(limiter.consume(1, 60_000)).toBe(true);
    expect(limiter.consume(1, 60_000)).toBe(true);
    expect(limiter.consume(1, 60_000)).toBe(false);
  });

  it('isolates token buckets per clientId', () => {
    const limiter = new RateLimiter({ capacity: 1, refillPerSec: 1 });
    expect(limiter.consume(1, 100)).toBe(true);
    expect(limiter.consume(1, 100)).toBe(false);
    expect(limiter.consume(2, 100)).toBe(true);
  });

  it('remove deletes client state so reconnecting client starts fresh', () => {
    const limiter = new RateLimiter({ capacity: 1, refillPerSec: 1 });
    expect(limiter.consume(7, 100)).toBe(true);
    expect(limiter.consume(7, 100)).toBe(false);

    limiter.remove(7);
    expect(limiter.consume(7, 100)).toBe(true);
  });
});
