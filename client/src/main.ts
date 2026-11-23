import {
  DEFAULT_ARENA_CONFIG,
  ShipState,
  SpatialHash,
  WorldState,
  createBulletPool,
  createParticlePool,
  createShip,
  stepWorld,
} from '../../shared/src';
import { GameLoop } from './gameLoop';
import { FrameProfiler } from './profiler';

export function startLocalBenchmark(botCount = 8): { loop: GameLoop; profiler: FrameProfiler } {
  const world: WorldState = {
    tick: 0,
    ships: [],
    bullets: createBulletPool(512),
    nextBulletId: 1,
  };
  const particles = createParticlePool(512);
  const spatialHash = new SpatialHash<ShipState>(128);
  const profiler = new FrameProfiler(1800, 16.7);

  for (let i = 1; i <= botCount; i++) {
    world.ships.push(createShip(i, 100 + i * 110, 200 + (i % 3) * 150, i * 0.5));
  }

  const inputs = new Map<number, { seq: number; thrust: number; turn: number; fire: boolean }>();

  const loop = new GameLoop(1 / 60, {
    update: (dt) => {
      for (const ship of world.ships) {
        inputs.set(ship.id, {
          seq: world.tick + 1,
          thrust: 0.8,
          turn: Math.sin((world.tick + ship.id) * 0.04),
          fire: (world.tick + ship.id) % 20 === 0,
        });
      }
      stepWorld(world, inputs, dt, spatialHash, DEFAULT_ARENA_CONFIG);

      particles.forEachActive((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.release(p);
      });
    },
    render: () => {
      // Canvas rendering hook
    },
    onFrameMetric: (ms) => profiler.record(ms),
  });

  return { loop, profiler };
}
