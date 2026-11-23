export interface RateLimiterOptions {
  capacity: number;
  refillPerSec: number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

/**
 * Token-bucket rate limiter protecting the authoritative server against packet floods.
 */
export class RateLimiter {
  private readonly buckets = new Map<number, Bucket>();

  constructor(private readonly options: RateLimiterOptions) {
    if (options.capacity <= 0 || options.refillPerSec <= 0) {
      throw new Error('RateLimiter capacity and refillPerSec must be positive');
    }
  }

  consume(clientId: number, nowMs: number, cost = 1): boolean {
    let bucket = this.buckets.get(clientId);
    if (!bucket) {
      bucket = { tokens: this.options.capacity, lastRefillMs: nowMs };
      this.buckets.set(clientId, bucket);
    } else if (nowMs > bucket.lastRefillMs) {
      const elapsedSec = (nowMs - bucket.lastRefillMs) / 1000;
      bucket.tokens = Math.min(
        this.options.capacity,
        bucket.tokens + elapsedSec * this.options.refillPerSec
      );
      bucket.lastRefillMs = nowMs;
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return true;
    }
    return false;
  }

  remove(clientId: number): void {
    this.buckets.delete(clientId);
  }
}
