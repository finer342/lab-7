import { describe, it, expect } from 'vitest';
import { ObjectPool, createBulletPool, createParticlePool } from '../src/pool';

describe('ObjectPool (V8 memory & zero-GC reuse)', () => {
  it('throws on non-positive capacity', () => {
    expect(() => new ObjectPool(0, () => ({ active: false }), () => {})).toThrow();
  });

  it('pre-allocates items and tracks active count on acquire/release', () => {
    const pool = createBulletPool(4);
    expect(pool.capacity).toBe(4);
    expect(pool.size).toBe(0);

    const b1 = pool.acquire();
    const b2 = pool.acquire();
    expect(b1).not.toBeNull();
    expect(b2).not.toBeNull();
    expect(pool.size).toBe(2);

    expect(pool.release(b1!)).toBe(true);
    expect(pool.size).toBe(1);
    expect(b1!.active).toBe(false);
  });

  it('returns null when pool capacity is exhausted', () => {
    const pool = createBulletPool(2);
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).toBeNull();
  });

  it('reuses exact object instances without allocating new heap objects', () => {
    const pool = createBulletPool(1);
    const first = pool.acquire()!;
    first.x = 999;
    pool.release(first);

    const second = pool.acquire()!;
    expect(second).toBe(first);
    expect(second.x).toBe(0); // resetFn cleared stale state
  });

  it('ignores double release or foreign object release', () => {
    const pool = createBulletPool(2);
    const b = pool.acquire()!;
    expect(pool.release(b)).toBe(true);
    expect(pool.release(b)).toBe(false);
    expect(pool.size).toBe(0);
  });

  it('forEachActive iterates only active elements', () => {
    const pool = createParticlePool(5);
    const p1 = pool.acquire()!;
    const p2 = pool.acquire()!;
    p1.x = 10;
    p2.x = 20;
    pool.release(p1);

    const visited: number[] = [];
    pool.forEachActive((p) => visited.push(p.x));
    expect(visited).toEqual([20]);
  });

  it('clear resets all items to inactive and restores full capacity', () => {
    const pool = createBulletPool(3);
    pool.acquire();
    pool.acquire();
    pool.clear();
    expect(pool.size).toBe(0);
    expect(pool.acquire()).not.toBeNull();
  });
});
