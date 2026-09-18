import "server-only";

import { randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import {
  createOperationalSignalEvidence,
  hashOperationalSignalEvidence,
  validateOperationalSignalEvidence,
  type OperationalSignalEvidence,
  type OperationalSignalMeasurement,
} from "@/lib/ops/operational-signal-evidence";
import {
  enqueueOperationalSignal,
  ensureOperationalSignalSpoolDirectories,
} from "@/lib/ops/operational-signal-spool";

const MAX_STATE_BYTES = 32 * 1024;
const HASH_RE = /^[0-9a-f]{64}$/;

type ActiveIncident = Readonly<{
  incidentKey: string;
  incidentId: string;
  conditionFingerprint: string;
  signalType: string;
  component: string;
  sourceUnit: string;
  severity: "critical";
  openedAt: string;
}>;

type PendingTransition = Readonly<{
  signal: OperationalSignalEvidence;
  nextActive: ActiveIncident | null;
}>;

type ConditionState = Readonly<{
  schemaVersion: 1;
  incidentKey: string;
  active: ActiveIncident | null;
  pending: PendingTransition | null;
  stateHash: string;
}>;

export type OperationalConditionObservation = Readonly<{
  stateDirectory: string;
  signalType: string;
  component: string;
  sourceUnit: string;
  status: "healthy" | "warning" | "critical";
  observedAt: string;
  reasonCodes: readonly string[];
  measurements?: Readonly<Record<string, OperationalSignalMeasurement>>;
}>;

export type OperationalConditionTransition = Readonly<{
  active: boolean;
  emitted: readonly OperationalSignalEvidence[];
  replayed: number;
  recoveredPending: boolean;
}>;

type EnqueueResult = Awaited<ReturnType<typeof enqueueOperationalSignal>>;

export type OperationalConditionDependencies = Readonly<{
  enqueue?: (
    stateDirectory: string,
    signal: OperationalSignalEvidence,
  ) => Promise<EnqueueResult>;
}>;

function stableStateHash(input: Omit<ConditionState, "stateHash">): string {
  return hashOperationalSignalEvidence({
    authority: "tecpey-operational-condition-state-v2",
    schemaVersion: input.schemaVersion,
    incidentKey: input.incidentKey,
    active: input.active,
    pending: input.pending,
  });
}

function withStateHash(
  input: Omit<ConditionState, "stateHash">,
): ConditionState {
  return Object.freeze({
    ...input,
    stateHash: stableStateHash(input),
  });
}

function incidentId(): string {
  return randomBytes(32).toString("hex");
}

function conditionProbe(input: OperationalConditionObservation) {
  const reasonCodes =
    input.reasonCodes.length > 0
      ? input.reasonCodes
      : [
          input.status === "healthy"
            ? "condition_healthy"
            : input.status === "warning"
              ? "condition_warning"
              : "condition_critical",
        ];
  return createOperationalSignalEvidence({
    signalType: input.signalType,
    component: input.component,
    sourceUnit: input.sourceUnit,
    severity: "critical",
    lifecycle: "firing",
    occurredAt: input.observedAt,
    reasonCodes,
    measurements: input.measurements ?? {},
  });
}

function validateActiveIncident(
  raw: ActiveIncident,
  expectedIncidentKey: string,
): ActiveIncident {
  if (
    !raw ||
    raw.severity !== "critical" ||
    !HASH_RE.test(raw.incidentId) ||
    !HASH_RE.test(raw.conditionFingerprint)
  ) {
    throw new Error("operational_condition_active_state_invalid");
  }
  const probe = createOperationalSignalEvidence({
    signalType: raw.signalType,
    component: raw.component,
    sourceUnit: raw.sourceUnit,
    severity: "critical",
    lifecycle: "firing",
    occurredAt: raw.openedAt,
    reasonCodes: ["state_validation"],
  });
  if (
    probe.incidentKey !== expectedIncidentKey ||
    raw.incidentKey !== expectedIncidentKey
  ) {
    throw new Error("operational_condition_active_state_invalid");
  }
  return Object.freeze({
    incidentKey: raw.incidentKey,
    incidentId: raw.incidentId,
    conditionFingerprint: raw.conditionFingerprint,
    signalType: probe.signalType,
    component: probe.component,
    sourceUnit: probe.sourceUnit,
    severity: "critical",
    openedAt: probe.occurredAt,
  });
}

function validateConditionState(
  value: unknown,
  expectedIncidentKey: string,
): ConditionState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("operational_condition_state_invalid");
  }
  const raw = value as Record<string, unknown>;
  if (
    raw.schemaVersion !== 1 ||
    raw.incidentKey !== expectedIncidentKey ||
    typeof raw.stateHash !== "string" ||
    !HASH_RE.test(raw.stateHash)
  ) {
    throw new Error("operational_condition_state_invalid");
  }

  const active =
    raw.active === null
      ? null
      : validateActiveIncident(
          raw.active as ActiveIncident,
          expectedIncidentKey,
        );

  let pending: PendingTransition | null = null;
  if (raw.pending !== null) {
    if (
      !raw.pending ||
      typeof raw.pending !== "object" ||
      Array.isArray(raw.pending)
    ) {
      throw new Error("operational_condition_pending_invalid");
    }
    const rawPending = raw.pending as Record<string, unknown>;
    const signal = validateOperationalSignalEvidence(
      rawPending.signal as OperationalSignalEvidence,
    );
    if (signal.incidentKey !== expectedIncidentKey) {
      throw new Error("operational_condition_pending_invalid");
    }
    const nextActive =
      rawPending.nextActive === null
        ? null
        : validateActiveIncident(
            rawPending.nextActive as ActiveIncident,
            expectedIncidentKey,
          );
    if (
      (signal.lifecycle === "firing" &&
        (!nextActive || nextActive.incidentId !== signal.incidentId)) ||
      (signal.lifecycle === "resolved" && nextActive !== null)
    ) {
      throw new Error("operational_condition_pending_invalid");
    }
    pending = Object.freeze({ signal, nextActive });
  }

  const state = withStateHash({
    schemaVersion: 1,
    incidentKey: expectedIncidentKey,
    active,
    pending,
  });
  if (state.stateHash !== raw.stateHash) {
    throw new Error("operational_condition_state_hash_mismatch");
  }
  return state;
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function conditionStateDirectory(
  stateDirectory: string,
): Promise<string> {
  const managed = await ensureOperationalSignalSpoolDirectories(
    stateDirectory,
  );
  const signalsDirectory = path.join(managed.root, "signals");
  const directory = path.join(signalsDirectory, "conditions");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("operational_condition_state_directory_unsafe");
  }
  await chmod(directory, 0o700);
  const canonical = await realpath(directory);
  if (canonical !== directory) {
    throw new Error("operational_condition_state_directory_alias_forbidden");
  }
  await syncDirectory(signalsDirectory);
  await syncDirectory(directory);
  return directory;
}

function stateFileName(incidentKey: string): string {
  return `${hashOperationalSignalEvidence({
    authority: "tecpey-operational-condition-state-file-v2",
    incidentKey,
  })}.json`;
}

async function readState(
  filePath: string,
  incidentKey: string,
): Promise<ConditionState | null> {
  const stat = await lstat(filePath).catch(() => null);
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("operational_condition_state_file_unsafe");
  }
  if (stat.size < 2 || stat.size > MAX_STATE_BYTES) {
    throw new Error("operational_condition_state_size_invalid");
  }
  return validateConditionState(
    JSON.parse(await readFile(filePath, "utf8")) as unknown,
    incidentKey,
  );
}

async function atomicWriteState(
  filePath: string,
  state: ConditionState,
): Promise<void> {
  const parent = path.dirname(filePath);
  const stat = await lstat(parent);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("operational_condition_state_parent_unsafe");
  }
  const content = `${JSON.stringify(state)}\n`;
  if (Buffer.byteLength(content) > MAX_STATE_BYTES) {
    throw new Error("operational_condition_state_size_invalid");
  }
  const temporary = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, { encoding: "utf8" });
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
    await syncDirectory(parent);
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
  await syncDirectory(path.dirname(filePath));
}

function activeFromSignal(
  signal: OperationalSignalEvidence,
): ActiveIncident {
  if (signal.lifecycle !== "firing" || signal.severity !== "critical") {
    throw new Error("operational_condition_firing_signal_invalid");
  }
  return Object.freeze({
    incidentKey: signal.incidentKey,
    incidentId: signal.incidentId,
    conditionFingerprint: signal.conditionFingerprint,
    signalType: signal.signalType,
    component: signal.component,
    sourceUnit: signal.sourceUnit,
    severity: "critical",
    openedAt: signal.occurredAt,
  });
}

function firingSignal(
  input: OperationalConditionObservation,
  newIncidentId: string,
): OperationalSignalEvidence {
  if (input.status !== "critical" || input.reasonCodes.length === 0) {
    throw new Error("operational_condition_critical_reason_required");
  }
  return createOperationalSignalEvidence({
    signalType: input.signalType,
    component: input.component,
    sourceUnit: input.sourceUnit,
    severity: "critical",
    lifecycle: "firing",
    occurredAt: input.observedAt,
    incidentId: newIncidentId,
    reasonCodes: input.reasonCodes,
    measurements: input.measurements ?? {},
  });
}

function resolvedSignal(
  active: ActiveIncident,
  input: OperationalConditionObservation,
  reasonCode: "condition_changed" | "condition_recovered",
): OperationalSignalEvidence {
  return createOperationalSignalEvidence({
    signalType: active.signalType,
    component: active.component,
    sourceUnit: active.sourceUnit,
    severity: "critical",
    lifecycle: "resolved",
    occurredAt: input.observedAt,
    incidentId: active.incidentId,
    conditionFingerprint: active.conditionFingerprint,
    reasonCodes: [reasonCode],
    measurements: input.measurements ?? {},
  });
}

async function commitPending(
  input: {
    filePath: string;
    incidentKey: string;
    currentActive: ActiveIncident | null;
    signal: OperationalSignalEvidence;
    nextActive: ActiveIncident | null;
    stateDirectory: string;
  },
  enqueue: NonNullable<OperationalConditionDependencies["enqueue"]>,
): Promise<{ replayed: boolean }> {
  const pendingState = withStateHash({
    schemaVersion: 1,
    incidentKey: input.incidentKey,
    active: input.currentActive,
    pending: Object.freeze({
      signal: input.signal,
      nextActive: input.nextActive,
    }),
  });
  await atomicWriteState(input.filePath, pendingState);

  const queued = await enqueue(input.stateDirectory, input.signal);

  const committed = withStateHash({
    schemaVersion: 1,
    incidentKey: input.incidentKey,
    active: input.nextActive,
    pending: null,
  });
  await atomicWriteState(input.filePath, committed);
  if (input.nextActive === null) {
    await removeState(input.filePath);
  }
  return { replayed: queued.replayed };
}

async function recoverPending(
  state: ConditionState,
  filePath: string,
  stateDirectory: string,
  enqueue: NonNullable<OperationalConditionDependencies["enqueue"]>,
): Promise<{ state: ConditionState | null; replayed: boolean }> {
  if (!state.pending) return { state, replayed: false };

  const queued = await enqueue(stateDirectory, state.pending.signal);
  const committed = withStateHash({
    schemaVersion: 1,
    incidentKey: state.incidentKey,
    active: state.pending.nextActive,
    pending: null,
  });
  await atomicWriteState(filePath, committed);
  if (state.pending.nextActive === null) {
    await removeState(filePath);
    return { state: null, replayed: queued.replayed };
  }
  return { state: committed, replayed: queued.replayed };
}

export async function transitionOperationalConditionSignal(
  input: OperationalConditionObservation,
  dependencies: OperationalConditionDependencies = {},
): Promise<OperationalConditionTransition> {
  const enqueue = dependencies.enqueue ?? enqueueOperationalSignal;
  const probe = conditionProbe(input);
  const directory = await conditionStateDirectory(input.stateDirectory);
  const filePath = path.join(directory, stateFileName(probe.incidentKey));

  let state = await readState(filePath, probe.incidentKey);
  let replayed = 0;
  let recoveredPending = false;
  const emitted: OperationalSignalEvidence[] = [];

  if (state?.pending) {
    const recovered = await recoverPending(
      state,
      filePath,
      input.stateDirectory,
      enqueue,
    );
    state = recovered.state;
    replayed += recovered.replayed ? 1 : 0;
    recoveredPending = true;
  }

  let active = state?.active ?? null;

  if (input.status !== "critical") {
    if (!active) {
      return {
        active: false,
        emitted: Object.freeze(emitted),
        replayed,
        recoveredPending,
      };
    }
    const resolved = resolvedSignal(
      active,
      input,
      "condition_recovered",
    );
    const committed = await commitPending(
      {
        filePath,
        incidentKey: probe.incidentKey,
        currentActive: active,
        signal: resolved,
        nextActive: null,
        stateDirectory: input.stateDirectory,
      },
      enqueue,
    );
    emitted.push(resolved);
    replayed += committed.replayed ? 1 : 0;
    return {
      active: false,
      emitted: Object.freeze(emitted),
      replayed,
      recoveredPending,
    };
  }

  const candidate = firingSignal(input, incidentId());
  if (
    active &&
    active.conditionFingerprint === candidate.conditionFingerprint
  ) {
    return {
      active: true,
      emitted: Object.freeze(emitted),
      replayed,
      recoveredPending,
    };
  }

  if (active) {
    const resolved = resolvedSignal(active, input, "condition_changed");
    const committed = await commitPending(
      {
        filePath,
        incidentKey: probe.incidentKey,
        currentActive: active,
        signal: resolved,
        nextActive: null,
        stateDirectory: input.stateDirectory,
      },
      enqueue,
    );
    emitted.push(resolved);
    replayed += committed.replayed ? 1 : 0;
    active = null;
  }

  const firing = candidate;
  const nextActive = activeFromSignal(firing);
  const committed = await commitPending(
    {
      filePath,
      incidentKey: probe.incidentKey,
      currentActive: active,
      signal: firing,
      nextActive,
      stateDirectory: input.stateDirectory,
    },
    enqueue,
  );
  emitted.push(firing);
  replayed += committed.replayed ? 1 : 0;

  return {
    active: true,
    emitted: Object.freeze(emitted),
    replayed,
    recoveredPending,
  };
}
