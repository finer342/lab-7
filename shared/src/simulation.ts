import { checkCircleCollision, integrate } from './physics';
import { ObjectPool } from './pool';
import { SpatialHash } from './spatialHash';
import {
  ArenaConfig,
  BulletEntity,
  DEFAULT_ARENA_CONFIG,
  PlayerInput,
  ShipState,
} from './types';

export interface WorldState {
  tick: number;
  ships: ShipState[];
  bullets: ObjectPool<BulletEntity>;
  nextBulletId: number;
}

export function createShip(id: number, x: number, y: number, angle = 0): ShipState {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    angle,
    radius: DEFAULT_ARENA_CONFIG.shipRadius,
    hp: 100,
    cooldown: 0,
    lastProcessedSeq: 0,
  };
}

/**
 * Shared deterministic simulation step executed identically on client and server.
 * Uses ObjectPool for bullets and SpatialHash for O(N) broadphase collision detection.
 */
export function stepWorld(
  world: WorldState,
  inputsByShipId: ReadonlyMap<number, PlayerInput>,
  dt: number,
  spatialHash: SpatialHash<ShipState>,
  config: ArenaConfig = DEFAULT_ARENA_CONFIG
): void {
  world.tick++;

  // 1. Integrate ships & spawn pooled bullets
  for (let i = 0; i < world.ships.length; i++) {
    const ship = world.ships[i]!;
    if (ship.hp <= 0) continue;

    const input = inputsByShipId.get(ship.id);
    if (input) {
      integrate(ship, input, dt, config);
      if (input.fire && ship.cooldown <= 0) {
        const bullet = world.bullets.acquire();
        if (bullet) {
          const cos = Math.cos(ship.angle);
          const sin = Math.sin(ship.angle);
          bullet.id = world.nextBulletId++;
          bullet.ownerId = ship.id;
          bullet.x = ship.x + cos * (ship.radius + 6);
          bullet.y = ship.y + sin * (ship.radius + 6);
          bullet.vx = ship.vx + cos * config.bulletSpeed;
          bullet.vy = ship.vy + sin * config.bulletSpeed;
          bullet.radius = 4;
          bullet.ttl = config.bulletTtl;
          ship.cooldown = config.fireCooldown;
        }
      }
    }
  }

  // 2. Advance active bullets and release expired ones back to pool
  world.bullets.forEachActive((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.ttl -= dt;

    if (
      bullet.ttl <= 0 ||
      bullet.x < 0 ||
      bullet.x > config.width ||
      bullet.y < 0 ||
      bullet.y > config.height
    ) {
      world.bullets.release(bullet);
      return;
    }

    // Bullet vs ships check
    for (let i = 0; i < world.ships.length; i++) {
      const ship = world.ships[i]!;
      if (ship.hp <= 0 || ship.id === bullet.ownerId) continue;
      if (checkCircleCollision(bullet.x, bullet.y, bullet.radius, ship.x, ship.y, ship.radius)) {
        ship.hp = Math.max(0, ship.hp - 20);
        world.bullets.release(bullet);
        break;
      }
    }
  });

  // 3. Ship-to-ship collision detection via SpatialHash O(N)
  spatialHash.clear();
  for (let i = 0; i < world.ships.length; i++) {
    const ship = world.ships[i]!;
    if (ship.hp > 0) {
      spatialHash.insert(ship);
    }
  }

  spatialHash.queryPairs((a, b) => {
    if (checkCircleCollision(a.x, a.y, a.radius, b.x, b.y, b.radius)) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const overlap = (a.radius + b.radius - dist) * 0.5;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
    }
  });
}
