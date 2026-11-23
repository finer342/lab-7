import { describe, it, expect } from 'vitest';
import { SpatialHash, SpatialBody } from '../src/spatialHash';

describe('SpatialHash broadphase collision optimization', () => {
  it('throws on non-positive cellSize', () => {
    expect(() => new SpatialHash(0)).toThrow();
  });

  it('finds nearby bodies sharing a spatial grid cell', () => {
    const hash = new SpatialHash<SpatialBody>(100);
    const a: SpatialBody = { id: 1, x: 50, y: 50, radius: 15 };
    const b: SpatialBody = { id: 2, x: 70, y: 55, radius: 15 };
    hash.insert(a);
    hash.insert(b);

    const pairs: Array<[number, number]> = [];
    hash.queryPairs((x, y) => pairs.push([x.id, y.id]));
    expect(pairs).toEqual([[1, 2]]);
  });

  it('does not pair distant bodies in non-adjacent cells (O(N) pruning)', () => {
    const hash = new SpatialHash<SpatialBody>(100);
    hash.insert({ id: 1, x: 20, y: 20, radius: 10 });
    hash.insert({ id: 2, x: 950, y: 750, radius: 10 });

    let pairCount = 0;
    const checks = hash.queryPairs(() => pairCount++);
    expect(pairCount).toBe(0);
    expect(checks).toBe(0);
  });

  it('deduplicates pairs when large bodies span multiple grid cells', () => {
    const hash = new SpatialHash<SpatialBody>(50);
    // Both bodies sit right on cell boundary (50, 50)
    hash.insert({ id: 1, x: 50, y: 50, radius: 20 });
    hash.insert({ id: 2, x: 52, y: 52, radius: 20 });

    const pairs: Array<[number, number]> = [];
    hash.queryPairs((a, b) => pairs.push([a.id, b.id]));
    expect(pairs).toHaveLength(1);
  });

  it('clear removes previously inserted bodies without leaking state', () => {
    const hash = new SpatialHash<SpatialBody>(100);
    hash.insert({ id: 1, x: 10, y: 10, radius: 5 });
    hash.insert({ id: 2, x: 12, y: 12, radius: 5 });
    hash.clear();

    let count = 0;
    hash.queryPairs(() => count++);
    expect(count).toBe(0);
  });

  it('handles negative coordinates cleanly via bit-packed keys', () => {
    const hash = new SpatialHash<SpatialBody>(64);
    hash.insert({ id: 1, x: -30, y: -40, radius: 10 });
    hash.insert({ id: 2, x: -25, y: -35, radius: 10 });

    const pairs: Array<[number, number]> = [];
    hash.queryPairs((a, b) => pairs.push([a.id, b.id]));
    expect(pairs).toEqual([[1, 2]]);
  });
});
