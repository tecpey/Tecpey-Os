import {
  getBitycleRealtimeHealth,
  getFreshBitycleArenaSnapshot,
  type BitycleRealtimeHealth,
} from "./runtime-bitycle-market";

export type BitycleOperationalStatus = "disabled" | "healthy" | "degraded";

export type BitycleOperationalHealth = BitycleRealtimeHealth & {
  status: BitycleOperationalStatus;
  configured: boolean;
  authoritativeSnapshotReady: boolean;
};

export function getBitycleOperationalHealth(
  now = Date.now(),
  configured = Boolean(process.env.BITYCLE_STREAM_TOKEN?.trim()),
): BitycleOperationalHealth {
  const runtime = getBitycleRealtimeHealth();
  if (!configured) {
    return {
      ...runtime,
      status: "disabled",
      configured: false,
      authoritativeSnapshotReady: false,
    };
  }

  const authoritativeSnapshotReady = getFreshBitycleArenaSnapshot(now) !== null;
  return {
    ...runtime,
    status: runtime.connected && authoritativeSnapshotReady ? "healthy" : "degraded",
    configured: true,
    authoritativeSnapshotReady,
  };
}
