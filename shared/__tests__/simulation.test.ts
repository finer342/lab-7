import { describe, it, expect } from 'vitest';
import { createBulletPool } from '../src/pool';
import { SpatialHash } from '../src/spatialHash';
import { createShip, stepWorld, WorldState } from '../src/simulation';
import { DEFAULT_ARENA_CONFIG, PlayerInput, ShipState } from '../src/types';

function makeWorld(): WorldState {
  return {
    tick: 0,
    ships: [createShip(1, 200, 300, 0), createShip(2, 500, 300, Math.PI)],
    bullets: createBulletPool(64),
    nextBulletId: 1,
  };
}

describe('Step determinism & world simulation', () => {
  it('produces bit-identical world states given identical initial state and input sequence', () => {
    const worldA = makeWorld();
    const worldB = makeWorld();
    const hashA = new SpatialHash<ShipState>(128);
    const hashB = new SpatialHash<ShipState>(128);

    for (let t = 1; t <= 120; t++) {
      const inputs = new Map<number, PlayerInput>([
        [1, { seq: t, thrust: 0.8, turn: 0.3, fire: t % 15 === 0 }],
        [2, { seq: t, thrust: 0.6, turn: -0.4, fire: t % 20 === 0 }],
      ]);
      stepWorld(worldA, inputs, 1 / 60, hashA, DEFAULT_ARENA_CONFIG);
      stepWorld(worldB, inputs, 1 / 60, hashB, DEFAULT_ARENA_CONFIG);
    }

    expect(worldA.ships).toEqual(worldB.ships);
    expect(worldA.tick).toBe(worldB.tick);
    expect(worldA.bullets.size).toBe(worldB.bullets.size);
  });

  it('spawns pooled bullets when fire is pressed and cooldown is ready', () => {
    const world = makeWorld();
    const hash = new SpatialHash<ShipState>(128);
    const inputs = new Map<number, PlayerInput>([
      [1, { seq: 1, thrust: 0, turn: 0, fire: true }],
    ]);

    stepWorld(world, inputs, 1 / 60, hash);
    expect(world.bullets.size).toBe(1);
    expect(world.ships[0]!.cooldown).toBeGreaterThan(0);

    // Next immediate frame cannot fire because cooldown > 0
    stepWorld(world, inputs, 1 / 60, hash);
    expect(world.bullets.size).toBe(1);
  });

  it('damages target ship and returns bullet to pool upon hit', () => {
    const world: WorldState = {
      tick: 0,
      ships: [createShip(1, 200, 300, 0), createShip(2, 240, 300, Math.PI)],
      bullets: createBulletPool(16),
      nextBulletId: 1,
    };
    const hash = new SpatialHash<ShipState>(128);
    const inputs = new Map<number, PlayerInput>([
      [1, { seq: 1, thrust: 0, turn: 0, fire: true }],
    ]);

    for (let i = 0; i < 10; i++) {
      stepWorld(world, inputs, 1 / 60, hash);
    }

    expect(world.ships[1]!.hp).toBe(80);
    expect(world.bullets.size).toBe(0);
  });

  it('releases expired bullets back to ObjectPool when TTL reaches zero', () => {
    const world = makeWorld();
    const hash = new SpatialHash<ShipState>(128);
    const inputs = new Map<number, PlayerInput>([
      [1, { seq: 1, thrust: 0, turn: 0, fire: true }],
    ]);

    stepWorld(world, inputs, 1 / 60, hash);
    expect(world.bullets.size).toBe(1);

    // Advance past bulletTtl (1.4s)
    const noFire = new Map<number, PlayerInput>();
    for (let i = 0; i < 100; i++) {
      stepWorld(world, noFire, 1 / 60, hash);
    }
    expect(world.bullets.size).toBe(0);
  });

  it('separates overlapping ships on collision', () => {
    const world: WorldState = {
      tick: 0,
      ships: [createShip(1, 300, 300, 0), createShip(2, 310, 300, Math.PI)],
      bullets: createBulletPool(16),
      nextBulletId: 1,
    };
    const hash = new SpatialHash<ShipState>(128);
    stepWorld(world, new Map(), 1 / 60, hash);

    const dist = Math.hypot(world.ships[1]!.x - world.ships[0]!.x, world.ships[1]!.y - world.ships[0]!.y);
    expect(dist).toBeCloseTo(world.ships[0]!.radius + world.ships[1]!.radius);
  });

  it('skips dead ships (hp === 0) during integration and collisions', () => {
    const world = makeWorld();
    world.ships[0]!.hp = 0;
    const startX = world.ships[0]!.x;
    const hash = new SpatialHash<ShipState>(128);

    stepWorld(
      world,
      new Map([[1, { seq: 1, thrust: 1, turn: 1, fire: true }]]),
      0.1,
      hash
    );

    expect(world.ships[0]!.x).toBe(startX);
    expect(world.bullets.size).toBe(0);
  });
});
