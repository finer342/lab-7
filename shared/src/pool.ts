import { BulletEntity, ParticleEntity } from './types';

export interface Poolable {
  active: boolean;
}

/**
 * Fixed-capacity ObjectPool that eliminates GC spikes during gameplay.
 * Objects are pre-allocated once with consistent V8 Hidden Classes.
 */
export class ObjectPool<T extends Poolable> {
  private readonly items: T[];
  private readonly freeStack: number[];
  private activeCount = 0;

  constructor(capacity: number, factory: () => T, private readonly resetFn: (item: T) => void) {
    if (capacity <= 0) {
      throw new Error('ObjectPool capacity must be positive');
    }
    this.items = new Array<T>(capacity);
    this.freeStack = new Array<number>(capacity);
    for (let i = 0; i < capacity; i++) {
      const obj = factory();
      obj.active = false;
      this.items[i] = obj;
      this.freeStack[i] = capacity - 1 - i;
    }
  }

  get capacity(): number {
    return this.items.length;
  }

  get size(): number {
    return this.activeCount;
  }

  acquire(): T | null {
    if (this.freeStack.length === 0) {
      return null;
    }
    const idx = this.freeStack.pop()!;
    const item = this.items[idx]!;
    this.resetFn(item);
    item.active = true;
    this.activeCount++;
    return item;
  }

  release(item: T): boolean {
    if (!item.active) return false;
    const idx = this.items.indexOf(item);
    if (idx === -1) return false;
    item.active = false;
    this.activeCount--;
    this.freeStack.push(idx);
    return true;
  }

  forEachActive(cb: (item: T) => void): void {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      if (item.active) {
        cb(item);
      }
    }
  }

  clear(): void {
    this.freeStack.length = 0;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      item.active = false;
      this.freeStack.push(this.items.length - 1 - i);
    }
    this.activeCount = 0;
  }
}

export function createBulletPool(capacity = 256): ObjectPool<BulletEntity> {
  return new ObjectPool<BulletEntity>(
    capacity,
    () => ({
      active: false,
      id: 0,
      ownerId: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 4,
      ttl: 0,
    }),
    (b) => {
      b.id = 0;
      b.ownerId = 0;
      b.x = 0;
      b.y = 0;
      b.vx = 0;
      b.vy = 0;
      b.radius = 4;
      b.ttl = 0;
    }
  );
}

export function createParticlePool(capacity = 512): ObjectPool<ParticleEntity> {
  return new ObjectPool<ParticleEntity>(
    capacity,
    () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 2,
    }),
    (p) => {
      p.x = 0;
      p.y = 0;
      p.vx = 0;
      p.vy = 0;
      p.life = 0;
      p.maxLife = 1;
      p.size = 2;
    }
  );
}
