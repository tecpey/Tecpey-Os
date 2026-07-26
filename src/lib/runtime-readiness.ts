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
