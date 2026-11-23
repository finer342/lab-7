import { describe, it, expect } from 'vitest';
import {
  normalizeAngle,
  clamp,
  clampToArena,
  integrate,
  checkCircleCollision,
} from '../src/physics';
import { DEFAULT_ARENA_CONFIG } from '../src/types';
import { createShip } from '../src/simulation';

describe('Physics: integrate, arena bounds & collisions', () => {
  it('normalizeAngle wraps negative and >= 2*PI angles into [0, 2*PI)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
  });

  it('clamp restricts numbers to [min, max]', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(4, 0, 10)).toBe(4);
  });

  it('integrate accelerates ship forward along facing angle', () => {
    const ship = createShip(1, 500, 400, 0);
    integrate(ship, { seq: 1, thrust: 1, turn: 0, fire: false }, 0.1, DEFAULT_ARENA_CONFIG);
    expect(ship.vx).toBeGreaterThan(0);
    expect(ship.vy).toBeCloseTo(0);
    expect(ship.x).toBeGreaterThan(500);
    expect(ship.lastProcessedSeq).toBe(1);
  });

  it('integrate rotates ship according to turn input and turnSpeed', () => {
    const ship = createShip(1, 500, 400, 0);
    integrate(ship, { seq: 2, thrust: 0, turn: 1, fire: false }, 0.5, DEFAULT_ARENA_CONFIG);
    expect(ship.angle).toBeCloseTo(0.5 * DEFAULT_ARENA_CONFIG.turnSpeed);
  });

  it('integrate enforces maxSpeed cap even under prolonged thrust', () => {
    const ship = createShip(1, 100, 400, 0);
    for (let i = 1; i <= 120; i++) {
      integrate(ship, { seq: i, thrust: 1, turn: 0, fire: false }, 1 / 60, DEFAULT_ARENA_CONFIG);
      ship.x = 200; // keep away from wall
    }
    const speed = Math.hypot(ship.vx, ship.vy);
    expect(speed).toBeLessThanOrEqual(DEFAULT_ARENA_CONFIG.maxSpeed + 1e-6);
  });

  it('integrate decrements weapon cooldown down to zero', () => {
    const ship = createShip(1, 300, 300, 0);
    ship.cooldown = 0.2;
    integrate(ship, { seq: 1, thrust: 0, turn: 0, fire: false }, 0.05, DEFAULT_ARENA_CONFIG);
    expect(ship.cooldown).toBeCloseTo(0.15);
    integrate(ship, { seq: 2, thrust: 0, turn: 0, fire: false }, 0.5, DEFAULT_ARENA_CONFIG);
    expect(ship.cooldown).toBe(0);
  });

  it('integrate ignores non-positive or NaN dt', () => {
    const ship = createShip(1, 300, 300, 0.5);
    integrate(ship, { seq: 1, thrust: 1, turn: 1, fire: false }, 0, DEFAULT_ARENA_CONFIG);
    integrate(ship, { seq: 2, thrust: 1, turn: 1, fire: false }, Number.NaN, DEFAULT_ARENA_CONFIG);
    expect(ship.x).toBe(300);
    expect(ship.y).toBe(300);
    expect(ship.angle).toBe(0.5);
  });

  it('clampToArena keeps ship inside all four walls and zeroes outward velocity', () => {
    const ship = createShip(1, -50, 9999, 0);
    ship.vx = -100;
    ship.vy = 200;
    clampToArena(ship, DEFAULT_ARENA_CONFIG);

    expect(ship.x).toBe(ship.radius);
    expect(ship.vx).toBe(0);
    expect(ship.y).toBe(DEFAULT_ARENA_CONFIG.height - ship.radius);
    expect(ship.vy).toBe(0);
  });

  it('clampToArena handles top and right walls symmetrically', () => {
    const ship = createShip(1, 5000, -10, 0);
    ship.vx = 150;
    ship.vy = -80;
    clampToArena(ship, DEFAULT_ARENA_CONFIG);

    expect(ship.x).toBe(DEFAULT_ARENA_CONFIG.width - ship.radius);
    expect(ship.vx).toBe(0);
    expect(ship.y).toBe(ship.radius);
    expect(ship.vy).toBe(0);
  });

  it('checkCircleCollision detects overlapping circles', () => {
    expect(checkCircleCollision(0, 0, 10, 15, 0, 10)).toBe(true);
  });

  it('checkCircleCollision detects tangent circles', () => {
    expect(checkCircleCollision(0, 0, 10, 20, 0, 10)).toBe(true);
  });

  it('checkCircleCollision returns false for separated circles', () => {
    expect(checkCircleCollision(0, 0, 10, 25, 0, 10)).toBe(false);
  });
});
