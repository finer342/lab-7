import { Vec2 } from './types';

export function createVec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function vecSet(out: Vec2, x: number, y: number): Vec2 {
  out.x = x;
  out.y = y;
  return out;
}

export function vecCopy(out: Vec2, src: Vec2): Vec2 {
  out.x = src.x;
  out.y = src.y;
  return out;
}

export function vecAddMut(out: Vec2, a: Vec2, b: Vec2): Vec2 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  return out;
}

export function vecSubMut(out: Vec2, a: Vec2, b: Vec2): Vec2 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  return out;
}

export function vecScaleMut(out: Vec2, v: Vec2, scalar: number): Vec2 {
  out.x = v.x * scalar;
  out.y = v.y * scalar;
  return out;
}

export function vecAddScaledMut(out: Vec2, base: Vec2, dir: Vec2, scale: number): Vec2 {
  out.x = base.x + dir.x * scale;
  out.y = base.y + dir.y * scale;
  return out;
}

export function vecLengthSq(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}

export function vecLength(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function vecDistanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function vecNormalizeMut(out: Vec2, v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len <= 1e-9) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const inv = 1 / len;
  out.x = v.x * inv;
  out.y = v.y * inv;
  return out;
}

export function vecClampLengthMut(out: Vec2, v: Vec2, maxLen: number): Vec2 {
  const lenSq = v.x * v.x + v.y * v.y;
  if (lenSq > maxLen * maxLen && lenSq > 0) {
    const scale = maxLen / Math.sqrt(lenSq);
    out.x = v.x * scale;
    out.y = v.y * scale;
  } else {
    out.x = v.x;
    out.y = v.y;
  }
  return out;
}
