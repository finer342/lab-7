export interface SpatialBody {
  id: number;
  x: number;
  y: number;
  radius: number;
}

/**
 * Uniform 2D Spatial Hash Grid replacing O(N^2) all-pairs collision checks with O(N).
 * Uses integer bit-packed cell keys and pre-allocated buckets to minimize GC pressure.
 */
export class SpatialHash<T extends SpatialBody> {
  private readonly invCellSize: number;
  private readonly buckets = new Map<number, T[]>();
  private readonly bucketPool: T[][] = [];
  private readonly seenPairs = new Set<number>();

  constructor(private readonly cellSize = 128) {
    if (cellSize <= 0) {
      throw new Error('SpatialHash cellSize must be positive');
    }
    this.invCellSize = 1 / cellSize;
  }

  private packKey(cx: number, cy: number): number {
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  clear(): void {
    for (const bucket of this.buckets.values()) {
      bucket.length = 0;
      this.bucketPool.push(bucket);
    }
    this.buckets.clear();
    this.seenPairs.clear();
  }

  insert(body: T): void {
    const minCx = Math.floor((body.x - body.radius) * this.invCellSize);
    const maxCx = Math.floor((body.x + body.radius) * this.invCellSize);
    const minCy = Math.floor((body.y - body.radius) * this.invCellSize);
    const maxCy = Math.floor((body.y + body.radius) * this.invCellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = this.packKey(cx, cy);
        let bucket = this.buckets.get(key);
        if (!bucket) {
          bucket = this.bucketPool.pop() ?? [];
          this.buckets.set(key, bucket);
        }
        bucket.push(body);
      }
    }
  }

  queryPairs(onPair: (a: T, b: T) => void): number {
    this.seenPairs.clear();
    let checks = 0;

    for (const bucket of this.buckets.values()) {
      const len = bucket.length;
      for (let i = 0; i < len; i++) {
        const a = bucket[i]!;
        for (let j = i + 1; j < len; j++) {
          const b = bucket[j]!;
          if (a.id === b.id) continue;
          const lo = a.id < b.id ? a.id : b.id;
          const hi = a.id < b.id ? b.id : a.id;
          const pairKey = lo * 65536 + hi;
          if (this.seenPairs.has(pairKey)) continue;
          this.seenPairs.add(pairKey);
          checks++;
          onPair(a, b);
        }
      }
    }
    return checks;
  }
}
