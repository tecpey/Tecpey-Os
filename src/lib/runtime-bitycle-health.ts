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

export function evaluateBitycleOperationalHealth(input: {
  configured: boolean;
  runtime: BitycleRealtimeHealth;
  authoritativeSnapshotReady: boolean;
}): BitycleOperationalHealth {
  if (!input.configured) {
    return {
      ...input.runtime,
      status: "disabled",
      configured: false,
      authoritativeSnapshotReady: false,
    };
  }

  return {
    ...input.runtime,
    status: input.runtime.connected && input.authoritativeSnapshotReady
      ? "healthy"
      : "degraded",
    configured: true,
    authoritativeSnapshotReady: input.authoritativeSnapshotReady,
  };
}

export function getBitycleOperationalHealth(
  now = Date.now(),
  configured = Boolean(process.env.BITYCLE_STREAM_TOKEN?.trim()),
): BitycleOperationalHealth {
  return evaluateBitycleOperationalHealth({
    configured,
    runtime: getBitycleRealtimeHealth(),
    authoritativeSnapshotReady: getFreshBitycleArenaSnapshot(now) !== null,
  });
}
