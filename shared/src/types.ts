export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerInput {
  seq: number;
  thrust: number; // [-1, 1]
  turn: number;   // [-1, 1]
  fire: boolean;
}

/**
 * Monomorphic Ship structure (V8 Hidden Class stability):
 * All properties are initialized in fixed order with primitive types.
 */
export interface ShipState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // radians [0, 2*PI)
  radius: number;
  hp: number;
  cooldown: number;
  lastProcessedSeq: number;
}

export interface BulletEntity {
  active: boolean;
  id: number;
  ownerId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  ttl: number;
}

export interface ParticleEntity {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

export interface ArenaConfig {
  width: number;
  height: number;
  maxSpeed: number;
  thrustAccel: number;
  turnSpeed: number;
  drag: number;
  shipRadius: number;
  bulletSpeed: number;
  bulletTtl: number;
  fireCooldown: number;
}

export const DEFAULT_ARENA_CONFIG: ArenaConfig = {
  width: 1200,
  height: 800,
  maxSpeed: 380,
  thrustAccel: 520,
  turnSpeed: 3.6,
  drag: 0.985,
  shipRadius: 18,
  bulletSpeed: 640,
  bulletTtl: 1.4,
  fireCooldown: 0.22,
};
