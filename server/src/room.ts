import {
  ArenaConfig,
  ChatMessage,
  DEFAULT_ARENA_CONFIG,
  MsgType,
  PlayerInput,
  ShipState,
  SnapshotMessage,
  SpatialHash,
  WorldState,
  createBulletPool,
  createShip,
  decodeMessage,
  encodeMessage,
  stepWorld,
} from '../../shared/src';
import { RateLimiter } from './rateLimiter';

export class GameRoom {
  readonly world: WorldState;
  readonly spatialHash = new SpatialHash<ShipState>(128);
  private readonly latestInputs = new Map<number, PlayerInput>();
  private readonly inputLimiter = new RateLimiter({ capacity: 90, refillPerSec: 65 });
  private readonly chatLimiter = new RateLimiter({ capacity: 5, refillPerSec: 1 });
  private readonly botIds = new Set<number>();
  private nextEntityId = 1;

  constructor(readonly config: ArenaConfig = DEFAULT_ARENA_CONFIG) {
    this.world = {
      tick: 0,
      ships: [],
      bullets: createBulletPool(512),
      nextBulletId: 1,
    };
  }

  addPlayer(isBot = false): ShipState {
    const id = this.nextEntityId++;
    const x = 120 + ((id * 137) % (this.config.width - 240));
    const y = 120 + ((id * 97) % (this.config.height - 240));
    const ship = createShip(id, x, y, 0);
    this.world.ships.push(ship);
    if (isBot) {
      this.botIds.add(id);
    }
    return ship;
  }

  spawnBots(count: number): void {
    for (let i = 0; i < count; i++) {
      this.addPlayer(true);
    }
  }

  removePlayer(id: number): void {
    const idx = this.world.ships.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.world.ships.splice(idx, 1);
    }
    this.latestInputs.delete(id);
    this.botIds.delete(id);
    this.inputLimiter.remove(id);
    this.chatLimiter.remove(id);
  }

  handleBinaryPacket(
    senderId: number,
    packet: Uint8Array,
    nowMs: number
  ): { broadcastChat?: Uint8Array; error?: string } {
    const decoded = decodeMessage(packet);
    if (!decoded.ok) {
      return { error: decoded.error };
    }

    const msg = decoded.message;
    if (msg.type === MsgType.INPUT) {
      if (!this.inputLimiter.consume(senderId, nowMs)) {
        return { error: 'Rate limit exceeded for INPUT' };
      }
      this.latestInputs.set(senderId, {
        seq: msg.seq,
        thrust: msg.thrust,
        turn: msg.turn,
        fire: msg.fire,
      });
      return {};
    }

    if (msg.type === MsgType.CHAT) {
      if (!this.chatLimiter.consume(senderId, nowMs)) {
        return { error: 'Rate limit exceeded for CHAT' };
      }
      const chatOut: ChatMessage = {
        type: MsgType.CHAT,
        senderId,
        text: msg.text,
      };
      return { broadcastChat: encodeMessage(chatOut) };
    }

    return {};
  }

  tick(dt: number): Uint8Array[] {
    // Update AI bots deterministically
    for (const botId of this.botIds) {
      const seq = this.world.tick + 1;
      this.latestInputs.set(botId, {
        seq,
        thrust: 0.75,
        turn: Math.sin((this.world.tick + botId) * 0.05) * 0.8,
        fire: (this.world.tick + botId) % 25 === 0,
      });
    }

    stepWorld(this.world, this.latestInputs, dt, this.spatialHash, this.config);

    const snapshots: Uint8Array[] = [];
    for (const ship of this.world.ships) {
      const snap: SnapshotMessage = {
        type: MsgType.SNAPSHOT,
        playerId: ship.id,
        ackSeq: ship.lastProcessedSeq,
        x: ship.x,
        y: ship.y,
        vx: ship.vx,
        vy: ship.vy,
        angle: ship.angle,
        hp: ship.hp,
      };
      snapshots.push(encodeMessage(snap));
    }
    return snapshots;
  }
}
