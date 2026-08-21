export type RuntimeReadiness = {
  phase: "starting" | "ready" | "draining";
  requiredWorkers: "ready" | "disabled" | "starting";
};

declare global {
  var tecpeyRuntimeReadiness: RuntimeReadiness | undefined;
}

export function getRuntimeReadiness(): RuntimeReadiness {
  return globalThis.tecpeyRuntimeReadiness ?? {
    phase: "starting",
    requiredWorkers: "starting",
  };
}

export function setRuntimeReadiness(readiness: RuntimeReadiness): void {
  globalThis.tecpeyRuntimeReadiness = readiness;
}

/**
 * What /api/health may say about the withdrawal workers.
 *
 * server.ts starts them on two conditions — Redis present *and* custody enabled —
 * but reported readiness from one, so custody enabled without REDIS_URL started no
 * workers while health published requiredWorkers: "ready". The deployment contract
 * routes traffic on that response and health treats "starting" as a critical
 * production failure, so the difference decides whether an instance that cannot
 * execute a withdrawal stays in the load balancer.
 *
 * "disabled" is a deliberate posture and has to stay distinguishable from
 * "required but not running", which is a misconfiguration and must fail closed.
 * Both consumers read this, so the two cannot answer differently again.
 */
export function requiredWorkerReadiness(
  required: boolean,
  running: boolean,
): RuntimeReadiness["requiredWorkers"] {
  if (!required) return "disabled";
  return running ? "ready" : "starting";
}
