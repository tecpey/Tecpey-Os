import "server-only";

import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import {
  enqueueOperationalSignal,
  ensureOperationalSpoolDirectories,
} from "@/lib/ops/operational-alert-spool";
import {
  hashOperationalEvidence,
  validateOperationalSignalEvidence,
  type OperationalSignalEvidence,
} from "@/lib/ops/operational-job-evidence";

const MAX_STATE_BYTES = 8 * 1024;

type ActiveConditionState = {
  schemaVersion: 1;
  incidentId: string;
  source: string;
  sourceUnit: string;
  hostName: string;
  condition: string;
  conditionFingerprint: string;
  openedAt: string;
};

export type OperationalConditionObservation = {
  stateDirectory: string;
  source: string;
  sourceUnit: string;
  hostName: string;
  condition: string;
  status: "healthy" | "warning" | "critical";
  observedAt: string;
  reasonCodes: string[];
  counters: Record<string, number>;
  gauges: Record<string, number | null>;
};

export type OperationalConditionTransition = {
  active: boolean;
  emitted: OperationalSignalEvidence[];
  replayed: number;
};

function stateFileName(source: string, condition: string): string {
  return `${hashOperationalEvidence({ source, condition })}.json`;
}

async function conditionDirectory(stateDirectory: string): Promise<string> {
  const managed = await ensureOperationalSpoolDirectories(stateDirectory);
  const directory = path.join(managed.root, "signals", "active");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("operational_condition_state_directory_unsafe");
  }
  await chmod(directory, 0o700);
  return directory;
}

function validateState(value: unknown): ActiveConditionState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("operational_condition_state_invalid");
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) {
    throw new Error("operational_condition_state_invalid");
  }
  const probe = validateOperationalSignalEvidence({
    schemaVersion: 1,
    signalId: `${String(raw.source)}:${String(raw.incidentId)}:firing`,
    incidentId: String(raw.incidentId),
    source: String(raw.source),
    sourceUnit: String(raw.sourceUnit),
    hostName: String(raw.hostName),
    severity: "critical",
    lifecycle: "firing",
    condition: String(raw.condition),
    conditionFingerprint: String(raw.conditionFingerprint),
    occurredAt: String(raw.openedAt),
    reasonCodes: ["state_validation"],
    counters: {},
    gauges: {},
  });
  return {
    schemaVersion: 1,
    incidentId: probe.incidentId,
    source: probe.source,
    sourceUnit: probe.sourceUnit,
    hostName: probe.hostName,
    condition: probe.condition,
    conditionFingerprint: probe.conditionFingerprint,
    openedAt: probe.occurredAt,
  };
}

async function readState(filePath: string): Promise<ActiveConditionState | null> {
  const stat = await lstat(filePath).catch(() => null);
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("operational_condition_state_file_unsafe");
  }
  if (stat.size < 2 || stat.size > MAX_STATE_BYTES) {
    throw new Error("operational_condition_state_size_invalid");
  }
  return validateState(JSON.parse(await readFile(filePath, "utf8")) as unknown);
}

async function writeState(
  filePath: string,
  state: ActiveConditionState,
): Promise<void> {
  const parent = path.dirname(filePath);
  const stat = await lstat(parent);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("operational_condition_state_parent_unsafe");
  }
  const body = `${JSON.stringify(state)}\n`;
  if (Buffer.byteLength(body) > MAX_STATE_BYTES) {
    throw new Error("operational_condition_state_size_invalid");
  }
  const temporary = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(body, { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    const existing = await lstat(filePath).catch(() => null);
    if (existing?.isSymbolicLink()) {
      throw new Error("operational_condition_state_target_symlink");
    }
    await rename(temporary, filePath);
    await chmod(filePath, 0o600);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function removeState(filePath: string): Promise<void> {
  const stat = await lstat(filePath).catch(() => null);
  if (!stat) return;
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("operational_condition_state_file_unsafe");
  }
  await rm(filePath);
}

function signal(
  state: ActiveConditionState,
  input: {
    lifecycle: "firing" | "resolved";
    occurredAt: string;
    reasonCodes: string[];
    counters: Record<string, number>;
    gauges: Record<string, number | null>;
  },
): OperationalSignalEvidence {
  return validateOperationalSignalEvidence({
    schemaVersion: 1,
    signalId: `${state.source}:${state.incidentId}:${input.lifecycle}`,
    incidentId: state.incidentId,
    source: state.source,
    sourceUnit: state.sourceUnit,
    hostName: state.hostName,
    severity: "critical",
    lifecycle: input.lifecycle,
    condition: state.condition,
    conditionFingerprint: state.conditionFingerprint,
    occurredAt: input.occurredAt,
    reasonCodes: input.reasonCodes,
    counters: input.counters,
    gauges: input.gauges,
  });
}

export async function transitionOperationalConditionSignal(
  input: OperationalConditionObservation,
): Promise<OperationalConditionTransition> {
  const fingerprint = hashOperationalEvidence({
    source: input.source,
    condition: input.condition,
    reasonCodes: [...input.reasonCodes].sort(),
  });

  // Validate the current observation through the signal contract before any
  // filesystem mutation, while keeping warning/healthy observations non-paging.
  const validationIncidentId = randomUUID();
  validateOperationalSignalEvidence({
    schemaVersion: 1,
    signalId: `${input.source}:${validationIncidentId}:firing`,
    incidentId: validationIncidentId,
    source: input.source,
    sourceUnit: input.sourceUnit,
    hostName: input.hostName,
    severity: "critical",
    lifecycle: "firing",
    condition: input.condition,
    conditionFingerprint: fingerprint,
    occurredAt: input.observedAt,
    reasonCodes:
      input.reasonCodes.length > 0 ? input.reasonCodes : ["condition_observed"],
    counters: input.counters,
    gauges: input.gauges,
  });

  const directory = await conditionDirectory(input.stateDirectory);
  const filePath = path.join(
    directory,
    stateFileName(input.source, input.condition),
  );
  const current = await readState(filePath);
  const emitted: OperationalSignalEvidence[] = [];
  let replayed = 0;

  if (input.status !== "critical") {
    if (!current) return { active: false, emitted, replayed };
    const resolved = signal(current, {
      lifecycle: "resolved",
      occurredAt: input.observedAt,
      reasonCodes: ["condition_recovered"],
      counters: input.counters,
      gauges: input.gauges,
    });
    const result = await enqueueOperationalSignal(
      input.stateDirectory,
      resolved,
    );
    if (result.replayed) replayed += 1;
    emitted.push(resolved);
    await removeState(filePath);
    return { active: false, emitted, replayed };
  }

  if (current?.conditionFingerprint === fingerprint) {
    return { active: true, emitted, replayed };
  }

  if (current) {
    const resolved = signal(current, {
      lifecycle: "resolved",
      occurredAt: input.observedAt,
      reasonCodes: ["condition_changed", "condition_recovered"],
      counters: input.counters,
      gauges: input.gauges,
    });
    const result = await enqueueOperationalSignal(
      input.stateDirectory,
      resolved,
    );
    if (result.replayed) replayed += 1;
    emitted.push(resolved);
  }

  const next: ActiveConditionState = {
    schemaVersion: 1,
    incidentId: randomUUID(),
    source: input.source,
    sourceUnit: input.sourceUnit,
    hostName: input.hostName,
    condition: input.condition,
    conditionFingerprint: fingerprint,
    openedAt: input.observedAt,
  };
  const firing = signal(next, {
    lifecycle: "firing",
    occurredAt: input.observedAt,
    reasonCodes: input.reasonCodes,
    counters: input.counters,
    gauges: input.gauges,
  });
  const result = await enqueueOperationalSignal(input.stateDirectory, firing);
  if (result.replayed) replayed += 1;
  emitted.push(firing);

  // Spool first, state second: a crash can at worst create a duplicate incident
  // on the next observation; it cannot suppress an alert that was never spooled.
  await writeState(filePath, next);
  return { active: true, emitted, replayed };
}
