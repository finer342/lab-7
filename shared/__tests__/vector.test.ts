import { describe, it, expect } from 'vitest';
import {
  createVec2,
  vecSet,
  vecCopy,
  vecAddMut,
  vecSubMut,
  vecScaleMut,
  vecAddScaledMut,
  vecLengthSq,
  vecLength,
  vecDistanceSq,
  vecNormalizeMut,
  vecClampLengthMut,
} from '../src/vector';

describe('Vector math (zero-allocation mutators)', () => {
  it('createVec2 initializes default and custom coordinates', () => {
    expect(createVec2()).toEqual({ x: 0, y: 0 });
    expect(createVec2(3, -4)).toEqual({ x: 3, y: -4 });
  });

  it('vecSet and vecCopy mutate target in place without creating new references', () => {
    const out = createVec2();
    const resSet = vecSet(out, 10, 20);
    expect(resSet).toBe(out);
    expect(out).toEqual({ x: 10, y: 20 });

    const target = createVec2();
    const resCopy = vecCopy(target, out);
    expect(resCopy).toBe(target);
    expect(target).toEqual({ x: 10, y: 20 });
  });

  it('vecAddMut computes vector addition in place', () => {
    const out = createVec2();
    vecAddMut(out, { x: 2, y: 3 }, { x: -5, y: 7 });
    expect(out).toEqual({ x: -3, y: 10 });
  });

  it('vecSubMut computes vector subtraction in place', () => {
    const out = createVec2();
    vecSubMut(out, { x: 8, y: 4 }, { x: 3, y: 9 });
    expect(out).toEqual({ x: 5, y: -5 });
  });

  it('vecScaleMut scales vector by scalar', () => {
    const out = createVec2();
    vecScaleMut(out, { x: 4, y: -6 }, 0.5);
    expect(out).toEqual({ x: 2, y: -3 });
  });

  it('vecAddScaledMut computes fused multiply-add in place', () => {
    const out = createVec2();
    vecAddScaledMut(out, { x: 10, y: 20 }, { x: 2, y: -3 }, 5);
    expect(out).toEqual({ x: 20, y: 5 });
  });

  it('vecLength, vecLengthSq, and vecDistanceSq return accurate magnitudes', () => {
    expect(vecLengthSq({ x: 3, y: 4 })).toBe(25);
    expect(vecLength({ x: 3, y: 4 })).toBe(5);
    expect(vecDistanceSq({ x: 1, y: 2 }, { x: 4, y: 6 })).toBe(25);
  });

  it('vecNormalizeMut normalizes non-zero vectors to unit length', () => {
    const out = createVec2();
    vecNormalizeMut(out, { x: 0, y: 5 });
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(1);
  });

  it('vecNormalizeMut safely handles zero-length vector without NaN', () => {
    const out = createVec2(9, 9);
    vecNormalizeMut(out, { x: 0, y: 0 });
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('vecClampLengthMut clamps only vectors exceeding maxLen', () => {
    const out = createVec2();
    vecClampLengthMut(out, { x: 3, y: 4 }, 10);
    expect(out).toEqual({ x: 3, y: 4 });

    vecClampLengthMut(out, { x: 30, y: 40 }, 10);
    expect(out.x).toBeCloseTo(6);
    expect(out.y).toBeCloseTo(8);
  });
});
