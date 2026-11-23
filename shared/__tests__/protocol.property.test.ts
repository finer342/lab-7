import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ANGLE_QUANTIZATION_STEP,
  MsgType,
  ProtocolMessage,
  decodeMessage,
  encodeMessage,
  expectedFrameLength,
} from '../src/protocol';
import { integrate, normalizeAngle } from '../src/physics';
import { DEFAULT_ARENA_CONFIG } from '../src/types';
import { createShip } from '../src/simulation';
import { SpatialHash, SpatialBody } from '../src/spatialHash';

const inputMsgArb = fc.record({
  type: fc.constant(MsgType.INPUT as const),
  seq: fc.integer({ min: 0, max: 0xffffffff }),
  thrust: fc.double({ min: -1, max: 1, noNaN: true }),
  turn: fc.double({ min: -1, max: 1, noNaN: true }),
  fire: fc.boolean(),
});

const snapshotMsgArb = fc.record({
  type: fc.constant(MsgType.SNAPSHOT as const),
  playerId: fc.integer({ min: 0, max: 0xffff }),
  ackSeq: fc.integer({ min: 0, max: 0xffffffff }),
  x: fc.float({ min: -10000, max: 10000, noNaN: true }),
  y: fc.float({ min: -10000, max: 10000, noNaN: true }),
  vx: fc.float({ min: -2000, max: 2000, noNaN: true }),
  vy: fc.float({ min: -2000, max: 2000, noNaN: true }),
  angle: fc.double({ min: -Math.PI * 4, max: Math.PI * 4, noNaN: true }),
  hp: fc.integer({ min: 0, max: 100 }),
});

const chatMsgArb = fc.record({
  type: fc.constant(MsgType.CHAT as const),
  senderId: fc.integer({ min: 0, max: 0xffff }),
  text: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => new TextEncoder().encode(s).byteLength <= 200),
});

const anyMessageArb: fc.Arbitrary<ProtocolMessage> = fc.oneof(
  inputMsgArb,
  snapshotMsgArb,
  chatMsgArb
);

describe('Property-based tests (fast-check)', () => {
  it('Property 1: round-trip encode -> decode preserves message within angle rounding tolerance', () => {
    fc.assert(
      fc.property(snapshotMsgArb, (msg) => {
        const encoded = encodeMessage(msg);
        const decoded = decodeMessage(encoded);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok || decoded.message.type !== MsgType.SNAPSHOT) return;

        expect(decoded.message.playerId).toBe(msg.playerId);
        expect(decoded.message.ackSeq).toBe(msg.ackSeq);
        expect(decoded.message.x).toBeCloseTo(msg.x, 4);
        expect(decoded.message.y).toBeCloseTo(msg.y, 4);
        expect(decoded.message.vx).toBeCloseTo(msg.vx, 4);
        expect(decoded.message.vy).toBeCloseTo(msg.vy, 4);
        expect(decoded.message.hp).toBe(msg.hp);

        const expectedAngle = normalizeAngle(msg.angle);
        const actualAngle = normalizeAngle(decoded.message.angle);
        const diff = Math.abs(expectedAngle - actualAngle);
        const circularDiff = Math.min(diff, Math.PI * 2 - diff);
        expect(circularDiff).toBeLessThanOrEqual(ANGLE_QUANTIZATION_STEP + 1e-6);
      }),
      { numRuns: 200 }
    );
  });

  it('Property 2: encoded frame byteLength matches protocol format specification for all messages', () => {
    fc.assert(
      fc.property(anyMessageArb, (msg) => {
        const frame = encodeMessage(msg);
        expect(frame.byteLength).toBe(expectedFrameLength(msg));
      }),
      { numRuns: 200 }
    );
  });

  it('Property 3: arbitrary malformed/corrupted byte buffers never crash the process', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 300 }), (randomBytes) => {
        const res = decodeMessage(randomBytes);
        expect(typeof res.ok).toBe('boolean');
        if (!res.ok) {
          expect(typeof res.error).toBe('string');
        }
      }),
      { numRuns: 300 }
    );
  });

  it('Property 4: ship always stays strictly inside arena bounds under arbitrary inputs and dt', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            seq: fc.integer({ min: 1, max: 10000 }),
            thrust: fc.double({ min: -5, max: 5, noNaN: true }),
            turn: fc.double({ min: -5, max: 5, noNaN: true }),
            fire: fc.boolean(),
            dt: fc.double({ min: 0.001, max: 0.5, noNaN: true }),
          }),
          { minLength: 1, maxLength: 40 }
        ),
        (steps) => {
          const ship = createShip(1, 600, 400, 0);
          for (const s of steps) {
            integrate(ship, s, s.dt, DEFAULT_ARENA_CONFIG);
            expect(ship.x).toBeGreaterThanOrEqual(ship.radius);
            expect(ship.x).toBeLessThanOrEqual(DEFAULT_ARENA_CONFIG.width - ship.radius);
            expect(ship.y).toBeGreaterThanOrEqual(ship.radius);
            expect(ship.y).toBeLessThanOrEqual(DEFAULT_ARENA_CONFIG.height - ship.radius);
          }
        }
      ),
      { numRuns: 150 }
    );
  });

  it('Property 5: parser accepts valid encoded frames and rejects corrupted/truncated/mutated frames', () => {
    fc.assert(
      fc.property(
        anyMessageArb,
        fc.integer({ min: 0, max: 255 }),
        fc.nat(),
        (msg, xorMask, idxSeed) => {
          const valid = encodeMessage(msg);
          expect(decodeMessage(valid).ok).toBe(true);

          // Truncated frame must be rejected
          const truncated = valid.subarray(0, valid.byteLength - 1);
          expect(decodeMessage(truncated).ok).toBe(false);

          // Corrupted header (magic or message type byte) must be rejected
          const corruptedHeader = new Uint8Array(valid);
          const headerIdx = idxSeed % 3;
          corruptedHeader[headerIdx] = (corruptedHeader[headerIdx]! ^ ((xorMask % 254) + 1)) & 0xff;
          expect(decodeMessage(corruptedHeader).ok).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Property 6: INPUT round-trip preserves seq, boolean fire flag, and quantized controls', () => {
    fc.assert(
      fc.property(inputMsgArb, (msg) => {
        const decoded = decodeMessage(encodeMessage(msg));
        expect(decoded.ok).toBe(true);
        if (!decoded.ok || decoded.message.type !== MsgType.INPUT) return;

        expect(decoded.message.seq).toBe(msg.seq);
        expect(decoded.message.fire).toBe(msg.fire);
        expect(decoded.message.thrust).toBeCloseTo(msg.thrust, 4);
        expect(decoded.message.turn).toBeCloseTo(msg.turn, 4);
      }),
      { numRuns: 150 }
    );
  });

  it('Property 7: SpatialHash finds every colliding pair that brute-force O(N^2) finds', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            x: fc.double({ min: 0, max: 1200, noNaN: true }),
            y: fc.double({ min: 0, max: 800, noNaN: true }),
            radius: fc.double({ min: 5, max: 30, noNaN: true }),
          }),
          { minLength: 2, maxLength: 25 }
        ),
        (rawBodies) => {
          const bodies: SpatialBody[] = rawBodies.map((b, i) => ({ id: i + 1, ...b }));
          const hash = new SpatialHash<SpatialBody>(128);
          for (const b of bodies) hash.insert(b);

          const hashPairs = new Set<string>();
          hash.queryPairs((a, b) => {
            const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
            hashPairs.add(key);
          });

          for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
              const a = bodies[i]!;
              const b = bodies[j]!;
              const dist = Math.hypot(a.x - b.x, a.y - b.y);
              if (dist <= a.radius + b.radius) {
                expect(hashPairs.has(`${a.id}:${b.id}`)).toBe(true);
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
