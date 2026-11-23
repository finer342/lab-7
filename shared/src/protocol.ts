import { normalizeAngle } from './physics';

export const PROTOCOL_MAGIC = 0x4c37; // 'L7'
export const ANGLE_MAX_UINT16 = 65535;
export const ANGLE_QUANTIZATION_STEP = (Math.PI * 2) / ANGLE_MAX_UINT16;

export enum MsgType {
  INPUT = 1,
  SNAPSHOT = 2,
  CHAT = 3,
}

/**
 * Exact binary frame byte lengths per format specification:
 * - INPUT:    2 (magic) + 1 (type) + 4 (seq) + 2 (thrust i16) + 2 (turn i16) + 1 (fire u8) = 12 bytes
 * - SNAPSHOT: 2 (magic) + 1 (type) + 2 (playerId u16) + 4 (ackSeq u32) + 4 (x f32) + 4 (y f32) + 4 (vx f32) + 4 (vy f32) + 2 (angle u16) + 1 (hp u8) = 28 bytes
 * - CHAT:     2 (magic) + 1 (type) + 2 (senderId u16) + 2 (payloadLen u16) + N (utf8 text, 1..200 bytes) = 7 + N bytes
 */
export const FIXED_FRAME_LENGTHS: Readonly<Record<MsgType.INPUT | MsgType.SNAPSHOT, number>> = {
  [MsgType.INPUT]: 12,
  [MsgType.SNAPSHOT]: 28,
};

export const CHAT_HEADER_LENGTH = 7;
export const MAX_CHAT_BYTES = 200;

export interface InputMessage {
  type: MsgType.INPUT;
  seq: number;
  thrust: number;
  turn: number;
  fire: boolean;
}

export interface SnapshotMessage {
  type: MsgType.SNAPSHOT;
  playerId: number;
  ackSeq: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
}

export interface ChatMessage {
  type: MsgType.CHAT;
  senderId: number;
  text: string;
}

export type ProtocolMessage = InputMessage | SnapshotMessage | ChatMessage;

export type DecodeResult =
  | { ok: true; message: ProtocolMessage }
  | { ok: false; error: string };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export function quantizeAngle(angleRad: number): number {
  const norm = normalizeAngle(angleRad);
  return Math.round((norm / (Math.PI * 2)) * ANGLE_MAX_UINT16) & 0xffff;
}

export function dequantizeAngle(encoded: number): number {
  return ((encoded & 0xffff) / ANGLE_MAX_UINT16) * Math.PI * 2;
}

export function expectedFrameLength(msg: ProtocolMessage): number {
  if (msg.type === MsgType.INPUT) return FIXED_FRAME_LENGTHS[MsgType.INPUT];
  if (msg.type === MsgType.SNAPSHOT) return FIXED_FRAME_LENGTHS[MsgType.SNAPSHOT];
  const utf8Len = textEncoder.encode(msg.text).byteLength;
  return CHAT_HEADER_LENGTH + utf8Len;
}

export function encodeMessage(msg: ProtocolMessage): Uint8Array {
  if (msg.type === MsgType.INPUT) {
    if (!Number.isInteger(msg.seq) || msg.seq < 0 || msg.seq > 0xffffffff) {
      throw new RangeError('Invalid input seq');
    }
    if (!Number.isFinite(msg.thrust) || msg.thrust < -1 || msg.thrust > 1) {
      throw new RangeError('Invalid thrust range');
    }
    if (!Number.isFinite(msg.turn) || msg.turn < -1 || msg.turn > 1) {
      throw new RangeError('Invalid turn range');
    }
    const buf = new Uint8Array(FIXED_FRAME_LENGTHS[MsgType.INPUT]);
    const view = new DataView(buf.buffer);
    view.setUint16(0, PROTOCOL_MAGIC, false);
    view.setUint8(2, MsgType.INPUT);
    view.setUint32(3, msg.seq >>> 0, false);
    view.setInt16(7, Math.round(msg.thrust * 32767), false);
    view.setInt16(9, Math.round(msg.turn * 32767), false);
    view.setUint8(11, msg.fire ? 1 : 0);
    return buf;
  }

  if (msg.type === MsgType.SNAPSHOT) {
    if (!Number.isInteger(msg.playerId) || msg.playerId < 0 || msg.playerId > 0xffff) {
      throw new RangeError('Invalid playerId');
    }
    if (!Number.isInteger(msg.ackSeq) || msg.ackSeq < 0 || msg.ackSeq > 0xffffffff) {
      throw new RangeError('Invalid ackSeq');
    }
    if (
      !Number.isFinite(msg.x) ||
      !Number.isFinite(msg.y) ||
      !Number.isFinite(msg.vx) ||
      !Number.isFinite(msg.vy) ||
      !Number.isFinite(msg.angle)
    ) {
      throw new RangeError('Non-finite snapshot float field');
    }
    if (!Number.isInteger(msg.hp) || msg.hp < 0 || msg.hp > 255) {
      throw new RangeError('Invalid hp');
    }

    const buf = new Uint8Array(FIXED_FRAME_LENGTHS[MsgType.SNAPSHOT]);
    const view = new DataView(buf.buffer);
    view.setUint16(0, PROTOCOL_MAGIC, false);
    view.setUint8(2, MsgType.SNAPSHOT);
    view.setUint16(3, msg.playerId, false);
    view.setUint32(5, msg.ackSeq >>> 0, false);
    view.setFloat32(9, msg.x, false);
    view.setFloat32(13, msg.y, false);
    view.setFloat32(17, msg.vx, false);
    view.setFloat32(21, msg.vy, false);
    view.setUint16(25, quantizeAngle(msg.angle), false);
    view.setUint8(27, msg.hp);
    return buf;
  }

  if (msg.type === MsgType.CHAT) {
    if (!Number.isInteger(msg.senderId) || msg.senderId < 0 || msg.senderId > 0xffff) {
      throw new RangeError('Invalid senderId');
    }
    const payload = textEncoder.encode(msg.text);
    if (payload.byteLength === 0 || payload.byteLength > MAX_CHAT_BYTES) {
      throw new RangeError('Chat payload length out of bounds');
    }
    const buf = new Uint8Array(CHAT_HEADER_LENGTH + payload.byteLength);
    const view = new DataView(buf.buffer);
    view.setUint16(0, PROTOCOL_MAGIC, false);
    view.setUint8(2, MsgType.CHAT);
    view.setUint16(3, msg.senderId, false);
    view.setUint16(5, payload.byteLength, false);
    buf.set(payload, CHAT_HEADER_LENGTH);
    return buf;
  }

  throw new TypeError('Unsupported message type');
}

/**
 * Safely decodes binary frames without throwing unhandled exceptions on malformed buffers.
 */
export function decodeMessage(buf: Uint8Array): DecodeResult {
  if (!(buf instanceof Uint8Array) || buf.byteLength < 3) {
    return { ok: false, error: 'Buffer too short for header' };
  }

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = view.getUint16(0, false);
  if (magic !== PROTOCOL_MAGIC) {
    return { ok: false, error: `Invalid protocol magic: 0x${magic.toString(16)}` };
  }

  const msgType = view.getUint8(2);

  if (msgType === MsgType.INPUT) {
    if (buf.byteLength !== FIXED_FRAME_LENGTHS[MsgType.INPUT]) {
      return { ok: false, error: `Invalid INPUT frame length: ${buf.byteLength}` };
    }
    const seq = view.getUint32(3, false);
    const rawThrust = view.getInt16(7, false);
    const rawTurn = view.getInt16(9, false);
    const rawFire = view.getUint8(11);
    if (rawFire !== 0 && rawFire !== 1) {
      return { ok: false, error: `Invalid fire flag: ${rawFire}` };
    }
    return {
      ok: true,
      message: {
        type: MsgType.INPUT,
        seq,
        thrust: Math.max(-1, Math.min(1, rawThrust / 32767)),
        turn: Math.max(-1, Math.min(1, rawTurn / 32767)),
        fire: rawFire === 1,
      },
    };
  }

  if (msgType === MsgType.SNAPSHOT) {
    if (buf.byteLength !== FIXED_FRAME_LENGTHS[MsgType.SNAPSHOT]) {
      return { ok: false, error: `Invalid SNAPSHOT frame length: ${buf.byteLength}` };
    }
    const playerId = view.getUint16(3, false);
    const ackSeq = view.getUint32(5, false);
    const x = view.getFloat32(9, false);
    const y = view.getFloat32(13, false);
    const vx = view.getFloat32(17, false);
    const vy = view.getFloat32(21, false);
    const angleEncoded = view.getUint16(25, false);
    const hp = view.getUint8(27);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(vx) || !Number.isFinite(vy)) {
      return { ok: false, error: 'Non-finite float in SNAPSHOT' };
    }

    return {
      ok: true,
      message: {
        type: MsgType.SNAPSHOT,
        playerId,
        ackSeq,
        x,
        y,
        vx,
        vy,
        angle: dequantizeAngle(angleEncoded),
        hp,
      },
    };
  }

  if (msgType === MsgType.CHAT) {
    if (buf.byteLength < CHAT_HEADER_LENGTH) {
      return { ok: false, error: 'Buffer too short for CHAT header' };
    }
    const senderId = view.getUint16(3, false);
    const payloadLen = view.getUint16(5, false);
    if (payloadLen === 0 || payloadLen > MAX_CHAT_BYTES) {
      return { ok: false, error: `Invalid CHAT payload length: ${payloadLen}` };
    }
    if (buf.byteLength !== CHAT_HEADER_LENGTH + payloadLen) {
      return { ok: false, error: 'CHAT frame length mismatch' };
    }
    try {
      const slice = buf.subarray(CHAT_HEADER_LENGTH, CHAT_HEADER_LENGTH + payloadLen);
      const text = textDecoder.decode(slice);
      return {
        ok: true,
        message: {
          type: MsgType.CHAT,
          senderId,
          text,
        },
      };
    } catch {
      return { ok: false, error: 'Invalid UTF-8 payload in CHAT' };
    }
  }

  return { ok: false, error: `Unknown message type: ${msgType}` };
}
