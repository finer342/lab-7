import {
  ArenaConfig,
  DEFAULT_ARENA_CONFIG,
  PlayerInput,
  ShipState,
  SnapshotMessage,
  integrate,
} from '../../shared/src';

export interface PendingInput {
  input: PlayerInput;
  dt: number;
}

/**
 * Client-side prediction & authoritative server state reconciliation.
 * Eliminates rubber-banding / frame jitter by replaying unacknowledged inputs.
 */
export class ClientReconciler {
  private readonly pending: PendingInput[] = [];

  get pendingCount(): number {
    return this.pending.length;
  }

  recordAndPredict(
    localShip: ShipState,
    input: PlayerInput,
    dt: number,
    config: ArenaConfig = DEFAULT_ARENA_CONFIG
  ): void {
    this.pending.push({ input: { ...input }, dt });
    integrate(localShip, input, dt, config);
  }

  reconcile(
    localShip: ShipState,
    snapshot: SnapshotMessage,
    config: ArenaConfig = DEFAULT_ARENA_CONFIG
  ): void {
    // 1. Snap to authoritative server state
    localShip.x = snapshot.x;
    localShip.y = snapshot.y;
    localShip.vx = snapshot.vx;
    localShip.vy = snapshot.vy;
    localShip.angle = snapshot.angle;
    localShip.hp = snapshot.hp;
    localShip.lastProcessedSeq = snapshot.ackSeq;

    // 2. Drop all inputs already processed by server
    let dropCount = 0;
    while (dropCount < this.pending.length && this.pending[dropCount]!.input.seq <= snapshot.ackSeq) {
      dropCount++;
    }
    if (dropCount > 0) {
      this.pending.splice(0, dropCount);
    }

    // 3. Deterministically replay remaining unacknowledged inputs
    for (let i = 0; i < this.pending.length; i++) {
      const entry = this.pending[i]!;
      integrate(localShip, entry.input, entry.dt, config);
    }
  }
}
