import { describe, it, expect } from 'vitest';
import { ClientReconciler } from '../src/reconciliation';
import { createShip } from '../../shared/src/simulation';
import { DEFAULT_ARENA_CONFIG, MsgType, integrate } from '../../shared/src';

describe('Client-server reconciliation', () => {
  it('replays unacknowledged inputs on top of server snapshot so client matches server prediction', () => {
    const reconciler = new ClientReconciler();
    const clientShip = createShip(1, 200, 300, 0);
    const dt = 1 / 60;

    // Client predicts 3 frames locally
    reconciler.recordAndPredict(clientShip, { seq: 1, thrust: 1, turn: 0, fire: false }, dt);
    reconciler.recordAndPredict(clientShip, { seq: 2, thrust: 1, turn: 0, fire: false }, dt);
    reconciler.recordAndPredict(clientShip, { seq: 3, thrust: 1, turn: 0, fire: false }, dt);
    expect(reconciler.pendingCount).toBe(3);

    // Server computes frame 1 identically and sends snapshot ackSeq = 1
    const serverShip = createShip(1, 200, 300, 0);
    integrate(serverShip, { seq: 1, thrust: 1, turn: 0, fire: false }, dt, DEFAULT_ARENA_CONFIG);

    const predictedXBeforeReconcile = clientShip.x;

    reconciler.reconcile(clientShip, {
      type: MsgType.SNAPSHOT,
      playerId: 1,
      ackSeq: 1,
      x: serverShip.x,
      y: serverShip.y,
      vx: serverShip.vx,
      vy: serverShip.vy,
      angle: serverShip.angle,
      hp: serverShip.hp,
    });

    expect(reconciler.pendingCount).toBe(2);
    expect(clientShip.x).toBeCloseTo(predictedXBeforeReconcile, 8);
  });

  it('drops all pending inputs when ackSeq catches up to latest sequence', () => {
    const reconciler = new ClientReconciler();
    const ship = createShip(1, 100, 100, 0);
    reconciler.recordAndPredict(ship, { seq: 10, thrust: 1, turn: 0, fire: false }, 1 / 60);
    reconciler.recordAndPredict(ship, { seq: 11, thrust: 1, turn: 0, fire: false }, 1 / 60);

    reconciler.reconcile(ship, {
      type: MsgType.SNAPSHOT,
      playerId: 1,
      ackSeq: 11,
      x: 150,
      y: 120,
      vx: 0,
      vy: 0,
      angle: 0,
      hp: 100,
    });

    expect(reconciler.pendingCount).toBe(0);
    expect(ship.x).toBe(150);
    expect(ship.y).toBe(120);
  });

  it('corrects client drift when server reports a different authoritative position', () => {
    const reconciler = new ClientReconciler();
    const ship = createShip(1, 100, 100, 0);
    reconciler.recordAndPredict(ship, { seq: 1, thrust: 0, turn: 0, fire: false }, 1 / 60);
    reconciler.recordAndPredict(ship, { seq: 2, thrust: 1, turn: 0, fire: false }, 1 / 60);

    // Server knocked ship to (400, 400) at seq 1
    reconciler.reconcile(ship, {
      type: MsgType.SNAPSHOT,
      playerId: 1,
      ackSeq: 1,
      x: 400,
      y: 400,
      vx: 0,
      vy: 0,
      angle: 0,
      hp: 80,
    });

    expect(ship.hp).toBe(80);
    expect(ship.x).toBeGreaterThan(400);
    expect(ship.y).toBeCloseTo(400);
  });

  it('updates hp and lastProcessedSeq from authoritative snapshot', () => {
    const reconciler = new ClientReconciler();
    const ship = createShip(1, 100, 100, 0);

    reconciler.reconcile(ship, {
      type: MsgType.SNAPSHOT,
      playerId: 1,
      ackSeq: 42,
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
      angle: 1.2,
      hp: 40,
    });

    expect(ship.hp).toBe(40);
    expect(ship.lastProcessedSeq).toBe(42);
    expect(ship.angle).toBe(1.2);
  });

  it('maintains identical state between client and server across 60 sequential frames with latency', () => {
    const reconciler = new ClientReconciler();
    const clientShip = createShip(1, 300, 300, 0);
    const serverShip = createShip(1, 300, 300, 0);
    const dt = 1 / 60;

    for (let seq = 1; seq <= 60; seq++) {
      const input = { seq, thrust: 0.7, turn: 0.2, fire: false };
      reconciler.recordAndPredict(clientShip, input, dt);
      integrate(serverShip, input, dt);

      // Simulate 3-frame delayed server snapshot
      if (seq > 3) {
        const delayedShip = createShip(1, 300, 300, 0);
        for (let s = 1; s <= seq - 3; s++) {
          integrate(delayedShip, { seq: s, thrust: 0.7, turn: 0.2, fire: false }, dt);
        }
        reconciler.reconcile(clientShip, {
          type: MsgType.SNAPSHOT,
          playerId: 1,
          ackSeq: seq - 3,
          x: delayedShip.x,
          y: delayedShip.y,
          vx: delayedShip.vx,
          vy: delayedShip.vy,
          angle: delayedShip.angle,
          hp: delayedShip.hp,
        });
      }
    }

    expect(clientShip.x).toBeCloseTo(serverShip.x, 8);
    expect(clientShip.y).toBeCloseTo(serverShip.y, 8);
    expect(clientShip.angle).toBeCloseTo(serverShip.angle, 8);
  });
});
