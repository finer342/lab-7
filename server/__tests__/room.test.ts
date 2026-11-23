import { describe, it, expect } from 'vitest';
import { GameRoom } from '../src/room';
import { MsgType, decodeMessage, encodeMessage } from '../../shared/src';

describe('Authoritative GameRoom (multiplayer, bots & protocol)', () => {
  it('adds and removes players cleanly', () => {
    const room = new GameRoom();
    const p1 = room.addPlayer();
    const p2 = room.addPlayer();
    expect(room.world.ships).toHaveLength(2);

    room.removePlayer(p1.id);
    expect(room.world.ships).toHaveLength(1);
    expect(room.world.ships[0]!.id).toBe(p2.id);
  });

  it('processes valid binary INPUT packet and updates player state on tick', () => {
    const room = new GameRoom();
    const p1 = room.addPlayer();
    const startX = p1.x;

    const pkt = encodeMessage({
      type: MsgType.INPUT,
      seq: 1,
      thrust: 1,
      turn: 0,
      fire: false,
    });

    const res = room.handleBinaryPacket(p1.id, pkt, 1000);
    expect(res.error).toBeUndefined();

    const snapshots = room.tick(1 / 60);
    expect(snapshots).toHaveLength(1);
    expect(p1.x).toBeGreaterThan(startX);

    const decoded = decodeMessage(snapshots[0]!);
    expect(decoded.ok).toBe(true);
    if (decoded.ok && decoded.message.type === MsgType.SNAPSHOT) {
      expect(decoded.message.ackSeq).toBe(1);
    }
  });

  it('rejects malformed binary packets without throwing', () => {
    const room = new GameRoom();
    const p1 = room.addPlayer();
    const res = room.handleBinaryPacket(p1.id, new Uint8Array([0xde, 0xad, 0xbe, 0xef]), 1000);
    expect(res.error).toBeDefined();
  });

  it('broadcasts valid CHAT messages and enforces chat rate limit', () => {
    const room = new GameRoom();
    const p1 = room.addPlayer();
    const chatPkt = encodeMessage({
      type: MsgType.CHAT,
      senderId: p1.id,
      text: 'GG!',
    });

    for (let i = 0; i < 5; i++) {
      const okRes = room.handleBinaryPacket(p1.id, chatPkt, 1000);
      expect(okRes.broadcastChat).toBeDefined();
    }

    const throttled = room.handleBinaryPacket(p1.id, chatPkt, 1000);
    expect(throttled.error).toMatch(/Rate limit/);
  });

  it('simulates 8 AI bots smoothly using SpatialHash and pooled bullets', () => {
    const room = new GameRoom();
    room.spawnBots(8);
    expect(room.world.ships).toHaveLength(8);

    for (let i = 0; i < 60; i++) {
      const snaps = room.tick(1 / 60);
      expect(snaps).toHaveLength(8);
    }
    expect(room.world.tick).toBe(60);
  });

  it('enforces input rate limit against flooding clients', () => {
    const room = new GameRoom();
    const p1 = room.addPlayer();
    const pkt = encodeMessage({
      type: MsgType.INPUT,
      seq: 1,
      thrust: 1,
      turn: 0,
      fire: false,
    });

    let blocked = false;
    for (let i = 0; i < 120; i++) {
      const res = room.handleBinaryPacket(p1.id, pkt, 1000);
      if (res.error) {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
  });
});
