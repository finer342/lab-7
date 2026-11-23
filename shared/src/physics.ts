import { ArenaConfig, DEFAULT_ARENA_CONFIG, PlayerInput, ShipState, Vec2 } from './types';
import { vecAddScaledMut, vecClampLengthMut, vecScaleMut, vecSet } from './vector';

const TWO_PI = Math.PI * 2;

// Pre-allocated scratch vectors for zero-allocation integration
const _dir: Vec2 = { x: 0, y: 0 };
const _vel: Vec2 = { x: 0, y: 0 };
const _pos: Vec2 = { x: 0, y: 0 };

export function normalizeAngle(angle: number): number {
  let a = angle % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

export function clamp(val: number, min: number, max: number): number {
  if (val < min) return min;
  if (val > max) return max;
  return val;
}

/**
 * Keeps a ship strictly inside arena boundaries, zeroing outward velocity on contact.
 */
export function clampToArena(ship: ShipState, config: ArenaConfig = DEFAULT_ARENA_CONFIG): void {
  const minX = ship.radius;
  const maxX = Math.max(minX, config.width - ship.radius);
  const minY = ship.radius;
  const maxY = Math.max(minY, config.height - ship.radius);

  if (ship.x < minX) {
    ship.x = minX;
    if (ship.vx < 0) ship.vx = 0;
  } else if (ship.x > maxX) {
    ship.x = maxX;
    if (ship.vx > 0) ship.vx = 0;
  }

  if (ship.y < minY) {
    ship.y = minY;
    if (ship.vy < 0) ship.vy = 0;
  } else if (ship.y > maxY) {
    ship.y = maxY;
    if (ship.vy > 0) ship.vy = 0;
  }
}

/**
 * Deterministic semi-implicit Euler integration in place (0 heap allocations).
 */
export function integrate(
  ship: ShipState,
  input: PlayerInput,
  dt: number,
  config: ArenaConfig = DEFAULT_ARENA_CONFIG
): void {
  if (!Number.isFinite(dt) || dt <= 0) return;

  const thrust = clamp(Number.isFinite(input.thrust) ? input.thrust : 0, -1, 1);
  const turn = clamp(Number.isFinite(input.turn) ? input.turn : 0, -1, 1);

  ship.angle = normalizeAngle(ship.angle + turn * config.turnSpeed * dt);

  vecSet(_dir, Math.cos(ship.angle), Math.sin(ship.angle));
  vecSet(_vel, ship.vx, ship.vy);
  vecAddScaledMut(_vel, _vel, _dir, thrust * config.thrustAccel * dt);
  vecScaleMut(_vel, _vel, Math.pow(config.drag, dt * 60));
  vecClampLengthMut(_vel, _vel, config.maxSpeed);

  ship.vx = _vel.x;
  ship.vy = _vel.y;

  vecSet(_pos, ship.x, ship.y);
  vecAddScaledMut(_pos, _pos, _vel, dt);
  ship.x = _pos.x;
  ship.y = _pos.y;

  if (ship.cooldown > 0) {
    ship.cooldown = Math.max(0, ship.cooldown - dt);
  }
  ship.lastProcessedSeq = input.seq;

  clampToArena(ship, config);
}

export function checkCircleCollision(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const rSum = ar + br;
  return dx * dx + dy * dy <= rSum * rSum;
}
