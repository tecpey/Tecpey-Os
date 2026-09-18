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
  reasonCodes: readonly string[];
  openedAt: string;
}>;

type PendingTransition = Readonly<{
  signals: readonly OperationalSignalEvidence[];
  nextActive: ActiveIncident | null;
}>;

type ConditionState = Readonly<{
  schemaVersion: 2;
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

function newIncidentId(): string {
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
    !HASH_RE.test(raw.conditionFingerprint) ||
    !Array.isArray(raw.reasonCodes) ||
    raw.reasonCodes.length === 0
  ) {
    throw new Error("operational_condition_active_state_invalid");
  }
  const firing = createOperationalSignalEvidence({
    signalType: raw.signalType,
    component: raw.component,
    sourceUnit: raw.sourceUnit,
    severity: "critical",
    lifecycle: "firing",
    occurredAt: raw.openedAt,
    incidentId: raw.incidentId,
    reasonCodes: raw.reasonCodes,
  });
  if (
    firing.incidentKey !== expectedIncidentKey ||
    raw.incidentKey !== expectedIncidentKey ||
    firing.conditionFingerprint !== raw.conditionFingerprint
  ) {
    throw new Error("operational_condition_active_state_invalid");
  }
  return Object.freeze({
    incidentKey: firing.incidentKey,
    incidentId: firing.incidentId,
    conditionFingerprint: firing.conditionFingerprint,
    signalType: firing.signalType,
    component: firing.component,
    sourceUnit: firing.sourceUnit,
    severity: "critical",
    reasonCodes: firing.reasonCodes,
    openedAt: firing.occurredAt,
  });
}

function validatePendingTransition(
  raw: unknown,
  active: ActiveIncident | null,
  expectedIncidentKey: string,
): PendingTransition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("operational_condition_pending_invalid");
  }
  const value = raw as Record<string, unknown>;
  if (
    !Array.isArray(value.signals) ||
    value.signals.length < 1 ||
    value.signals.length > 2
  ) {
    throw new Error("operational_condition_pending_invalid");
  }
  const signals = value.signals.map((signal) =>
    validateOperationalSignalEvidence(
      signal as OperationalSignalEvidence,
    ));
  if (signals.some((signal) => signal.incidentKey !== expectedIncidentKey)) {
    throw new Error("operational_condition_pending_invalid");
  }
  const nextActive =
    value.nextActive === null
      ? null
      : validateActiveIncident(
          value.nextActive as ActiveIncident,
          expectedIncidentKey,
        );

  if (signals.length === 1) {
    const [signal] = signals;
    if (
      signal!.lifecycle === "firing"
        ? active !== null ||
          nextActive === null ||
          nextActive.incidentId !== signal!.incidentId
        : active === null ||
          signal!.incidentId !== active.incidentId ||
          nextActive !== null
    ) {
      throw new Error("operational_condition_pending_invalid");
    }
  } else {
    const [resolved, firing] = signals;
    if (
      active === null ||
      resolved!.lifecycle !== "resolved" ||
      resolved!.incidentId !== active.incidentId ||
      firing!.lifecycle !== "firing" ||
      nextActive === null ||
      firing!.incidentId !== nextActive.incidentId ||
      resolved!.incidentId === firing!.incidentId
    ) {
      throw new Error("operational_condition_pending_invalid");
    }
  }

  return Object.freeze({
    signals: Object.freeze(signals),
    nextActive,
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
    raw.schemaVersion !== 2 ||
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
  const pending =
    raw.pending === null
      ? null
      : validatePendingTransition(
          raw.pending,
          active,
          expectedIncidentKey,
        );

  const state = withStateHash({
    schemaVersion: 2,
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
    reasonCodes: signal.reasonCodes,
    openedAt: signal.occurredAt,
  });
}

function firingSignal(
  input: OperationalConditionObservation,
  incidentId: string,
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
    incidentId,
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

async function enqueueSequence(
  stateDirectory: string,
  signals: readonly OperationalSignalEvidence[],
  enqueue: NonNullable<OperationalConditionDependencies["enqueue"]>,
): Promise<number> {
  let replayed = 0;
  for (const signal of signals) {
    const result = await enqueue(stateDirectory, signal);
    if (result.replayed) replayed += 1;
  }
  return replayed;
}

async function commitPending(
  input: {
    filePath: string;
    incidentKey: string;
    currentActive: ActiveIncident | null;
    signals: readonly OperationalSignalEvidence[];
    nextActive: ActiveIncident | null;
    stateDirectory: string;
  },
  enqueue: NonNullable<OperationalConditionDependencies["enqueue"]>,
): Promise<{ replayed: number }> {
  if (input.signals.length < 1 || input.signals.length > 2) {
    throw new Error("operational_condition_transition_sequence_invalid");
  }
  const pendingState = withStateHash({
    schemaVersion: 2,
    incidentKey: input.incidentKey,
    active: input.currentActive,
    pending: Object.freeze({
      signals: Object.freeze([...input.signals]),
      nextActive: input.nextActive,
    }),
  });
  await atomicWriteState(input.filePath, pendingState);

  const replayed = await enqueueSequence(
    input.stateDirectory,
    input.signals,
    enqueue,
  );

  const committed = withStateHash({
    schemaVersion: 2,
    incidentKey: input.incidentKey,
    active: input.nextActive,
    pending: null,
  });
  await atomicWriteState(input.filePath, committed);
  if (input.nextActive === null) {
    await removeState(input.filePath);
  }
  return { replayed };
}

async function recoverPending(
  state: ConditionState,
  filePath: string,
  stateDirectory: string,
  enqueue: NonNullable<OperationalConditionDependencies["enqueue"]>,
): Promise<{ state: ConditionState | null; replayed: number }> {
  if (!state.pending) return { state, replayed: 0 };

  const replayed = await enqueueSequence(
    stateDirectory,
    state.pending.signals,
    enqueue,
  );
  const committed = withStateHash({
    schemaVersion: 2,
    incidentKey: state.incidentKey,
    active: state.pending.nextActive,
    pending: null,
  });
  await atomicWriteState(filePath, committed);
  if (state.pending.nextActive === null) {
    await removeState(filePath);
    return { state: null, replayed };
  }
  return { state: committed, replayed };
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
    replayed += recovered.replayed;
    recoveredPending = true;
  }

  const active = state?.active ?? null;

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
        signals: [resolved],
        nextActive: null,
        stateDirectory: input.stateDirectory,
      },
      enqueue,
    );
    emitted.push(resolved);
    replayed += committed.replayed;
    return {
      active: false,
      emitted: Object.freeze(emitted),
      replayed,
      recoveredPending,
    };
  }

  const firing = firingSignal(input, newIncidentId());
  if (
    active &&
    active.conditionFingerprint === firing.conditionFingerprint
  ) {
    return {
      active: true,
      emitted: Object.freeze(emitted),
      replayed,
      recoveredPending,
    };
  }

  const nextActive = activeFromSignal(firing);
  const signals =
    active === null
      ? [firing]
      : [
          resolvedSignal(active, input, "condition_changed"),
          firing,
        ];
  const committed = await commitPending(
    {
      filePath,
      incidentKey: probe.incidentKey,
      currentActive: active,
      signals,
      nextActive,
      stateDirectory: input.stateDirectory,
    },
    enqueue,
  );
  emitted.push(...signals);
  replayed += committed.replayed;

  return {
    active: true,
    emitted: Object.freeze(emitted),
    replayed,
    recoveredPending,
  };
}
