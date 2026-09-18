import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import {
  createOperationalSignalEpisodeEvidence,
  validateOperationalSignalEvidence,
  type OperationalSignalEvidenceV2,
  type OperationalSignalMeasurement,
  type OperationalSignalSeverity,
} from "@/lib/ops/operational-signal-evidence";
import {
  enqueueOperationalSignal,
  ensureOperationalSignalSpoolDirectories,
} from "@/lib/ops/operational-signal-spool";

const STATE_SCHEMA_VERSION = 1 as const;
const MAX_STATE_BYTES = 64 * 1024;
const LOCK_STALE_MS = 120_000;
const HASH_RE = /^[0-9a-f]{64}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[a-z0-9][a-z0-9._:-]*$/;
const UNIT_RE = /^[A-Za-z0-9@_.:-]{3,200}\.service$/;

type ActiveEpisode = Readonly<{
  episodeId: string;
  episodeSequence: number;
  incidentKey: string;
  severity: OperationalSignalSeverity;
  reasonCodes: readonly string[];
}>;

type PendingTransition = Readonly<{
  signal: OperationalSignalEvidenceV2;
  nextActive: ActiveEpisode | null;
}>;

type EpisodeState = Readonly<{
  schemaVersion: typeof STATE_SCHEMA_VERSION;
  detectorKey: string;
  active: ActiveEpisode | null;
  pending: PendingTransition | null;
}>;

export type OperationalSignalEpisodeObservation = Readonly<{
  stateDirectory: string;
  signalType: string;
  component: string;
  sourceUnit: string;
  active: boolean;
  severity?: OperationalSignalSeverity;
  occurredAt: string;
  dedupeWindowSeconds?: number;
  reasonCodes?: readonly string[];
  measurements?: Readonly<Record<string, OperationalSignalMeasurement>>;
}>;

export type OperationalSignalEpisodeResult = Readonly<{
  detectorKey: string;
  activeEpisodeId: string | null;
  recoveredPending: boolean;
  emitted: readonly Readonly<{
    signalId: string;
    lifecycle: OperationalSignalEvidenceV2["lifecycle"];
    episodeId: string;
    episodeSequence: number;
    replayed: boolean;
  }>[];
}>;

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(",")}}`;
  }
  throw new Error("operational_signal_episode_state_value_invalid");
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function detectorKey(input: {
  signalType: string;
  component: string;
  sourceUnit: string;
}): string {
  const signalType = input.signalType.trim();
  const component = input.component.trim();
  const sourceUnit = input.sourceUnit.trim();
  if (
    !TOKEN_RE.test(signalType) ||
    signalType.length > 100 ||
    !TOKEN_RE.test(component) ||
    component.length > 100 ||
    !UNIT_RE.test(sourceUnit)
  ) {
    throw new Error("operational_signal_episode_detector_invalid");
  }
  return digest({
    authority: "tecpey-operational-signal-detector-v1",
    signalType,
    component,
    sourceUnit,
  });
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const parent = path.dirname(filePath);
  const parentStat = await lstat(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error("operational_signal_episode_state_directory_unsafe");
  }
  const existing = await lstat(filePath).catch(() => null);
  if (existing?.isSymbolicLink()) {
    throw new Error("operational_signal_episode_state_symlink");
  }
  const body = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(body) > MAX_STATE_BYTES) {
    throw new Error("operational_signal_episode_state_too_large");
  }
  const temporary = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporary, "wx", 0o600);
  let renamed = false;
  try {
    await handle.writeFile(body, "utf8");
    await handle.sync();
    await handle.close();
    await rename(temporary, filePath);
    renamed = true;
    await chmod(filePath, 0o600);
    await syncDirectory(parent);
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  } finally {
    if (!renamed) {
      await rm(temporary, { force: true });
      await syncDirectory(parent).catch(() => undefined);
    }
  }
}

function validateReasonCodes(values: unknown): string[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 32) {
    throw new Error("operational_signal_episode_reason_codes_invalid");
  }
  const output = values.map((value) => {
    if (
      typeof value !== "string" ||
      value.length < 3 ||
      value.length > 100 ||
      !TOKEN_RE.test(value)
    ) {
      throw new Error("operational_signal_episode_reason_codes_invalid");
    }
    return value;
  });
  const unique = [...new Set(output)].sort();
  if (unique.length !== output.length) {
    throw new Error("operational_signal_episode_reason_codes_invalid");
  }
  return unique;
}

function validateActive(value: unknown): ActiveEpisode | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("operational_signal_episode_active_invalid");
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.episodeId !== "string" ||
    !UUID_RE.test(raw.episodeId) ||
    typeof raw.episodeSequence !== "number" ||
    !Number.isSafeInteger(raw.episodeSequence) ||
    raw.episodeSequence < 1 ||
    raw.episodeSequence > 1_000_000 ||
    typeof raw.incidentKey !== "string" ||
    !HASH_RE.test(raw.incidentKey) ||
    (raw.severity !== "warning" && raw.severity !== "critical")
  ) {
    throw new Error("operational_signal_episode_active_invalid");
  }
  return Object.freeze({
    episodeId: raw.episodeId.toLowerCase(),
    episodeSequence: Number(raw.episodeSequence),
    incidentKey: raw.incidentKey,
    severity: raw.severity,
    reasonCodes: Object.freeze(validateReasonCodes(raw.reasonCodes)),
  });
}

function activeFromSignal(signal: OperationalSignalEvidenceV2): ActiveEpisode {
  return Object.freeze({
    episodeId: signal.episodeId,
    episodeSequence: signal.episodeSequence,
    incidentKey: signal.incidentKey,
    severity: signal.severity,
    reasonCodes: Object.freeze([...signal.reasonCodes]),
  });
}

function validatePending(value: unknown): PendingTransition | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("operational_signal_episode_pending_invalid");
  }
  const raw = value as Record<string, unknown>;
  const signal = validateOperationalSignalEvidence(
    raw.signal as OperationalSignalEvidenceV2,
  );
  if (signal.schemaVersion !== 2) {
    throw new Error("operational_signal_episode_pending_invalid");
  }
  const nextActive = validateActive(raw.nextActive);
  if (signal.lifecycle === "resolved") {
    if (nextActive !== null) {
      throw new Error("operational_signal_episode_pending_invalid");
    }
  } else {
    if (
      nextActive === null ||
      nextActive.episodeId !== signal.episodeId ||
      nextActive.episodeSequence !== signal.episodeSequence ||
      nextActive.incidentKey !== signal.incidentKey ||
      nextActive.severity !== signal.severity ||
      nextActive.reasonCodes.join("\n") !== signal.reasonCodes.join("\n")
    ) {
      throw new Error("operational_signal_episode_pending_invalid");
    }
  }
  return Object.freeze({ signal, nextActive });
}

function emptyState(key: string): EpisodeState {
  return Object.freeze({
    schemaVersion: STATE_SCHEMA_VERSION,
    detectorKey: key,
    active: null,
    pending: null,
  });
}

function validateState(value: unknown, key: string): EpisodeState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("operational_signal_episode_state_invalid");
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== STATE_SCHEMA_VERSION || raw.detectorKey !== key) {
    throw new Error("operational_signal_episode_state_invalid");
  }
  return Object.freeze({
    schemaVersion: STATE_SCHEMA_VERSION,
    detectorKey: key,
    active: validateActive(raw.active),
    pending: validatePending(raw.pending),
  });
}

async function readState(filePath: string, key: string): Promise<EpisodeState> {
  const stat = await lstat(filePath).catch(() => null);
  if (!stat) return emptyState(key);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("operational_signal_episode_state_unsafe");
  }
  if (stat.size < 2 || stat.size > MAX_STATE_BYTES) {
    throw new Error("operational_signal_episode_state_size_invalid");
  }
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  return validateState(parsed, key);
}

async function acquireLock(
  stateDirectory: string,
  key: string,
): Promise<() => Promise<void>> {
  const lockPath = path.join(stateDirectory, `${key}.lock`);
  const lockId = randomUUID();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(
          `${JSON.stringify({
            schemaVersion: 1,
            lockId,
            acquiredAt: new Date().toISOString(),
          })}\n`,
          "utf8",
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      await syncDirectory(stateDirectory);
      return async () => {
        const current = await readFile(lockPath, "utf8").catch(() => "");
        let ownsLock = false;
        try {
          ownsLock = (JSON.parse(current) as { lockId?: string }).lockId === lockId;
        } catch {
          ownsLock = false;
        }
        if (ownsLock) {
          await rm(lockPath, { force: true });
          await syncDirectory(stateDirectory);
        }
      };
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "EEXIST"
      ) {
        throw error;
      }
      const stat = await lstat(lockPath).catch(() => null);
      if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error("operational_signal_episode_lock_unsafe");
      }
      if (Date.now() - stat.mtimeMs <= LOCK_STALE_MS || attempt > 0) {
        throw new Error("operational_signal_episode_lock_busy");
      }
      await rm(lockPath, { force: true });
      await syncDirectory(stateDirectory);
    }
  }
  throw new Error("operational_signal_episode_lock_busy");
}

function pendingState(
  state: EpisodeState,
  signal: OperationalSignalEvidenceV2,
  nextActive: ActiveEpisode | null,
): EpisodeState {
  return Object.freeze({
    ...state,
    pending: Object.freeze({ signal, nextActive }),
  });
}

function settledState(
  state: EpisodeState,
  nextActive: ActiveEpisode | null,
): EpisodeState {
  return Object.freeze({
    ...state,
    active: nextActive,
    pending: null,
  });
}

async function flushPending(
  rootStateDirectory: string,
  filePath: string,
  state: EpisodeState,
  emitted: Array<OperationalSignalEpisodeResult["emitted"][number]>,
): Promise<{ state: EpisodeState; recovered: boolean }> {
  if (!state.pending) return { state, recovered: false };
  const queued = await enqueueOperationalSignal(
    rootStateDirectory,
    state.pending.signal,
  );
  emitted.push({
    signalId: state.pending.signal.signalId,
    lifecycle: state.pending.signal.lifecycle,
    episodeId: state.pending.signal.episodeId,
    episodeSequence: state.pending.signal.episodeSequence,
    replayed: queued.replayed,
  });
  const next = settledState(state, state.pending.nextActive);
  await atomicWriteJson(filePath, next);
  return { state: next, recovered: true };
}

function sameIncident(
  active: ActiveEpisode,
  signal: OperationalSignalEvidenceV2,
): boolean {
  return active.incidentKey === signal.incidentKey &&
    active.severity === signal.severity;
}

export async function observeOperationalSignalEpisode(
  input: OperationalSignalEpisodeObservation,
): Promise<OperationalSignalEpisodeResult> {
  const managed = await ensureOperationalSignalSpoolDirectories(
    input.stateDirectory,
  );
  const key = detectorKey(input);
  const stateFile = path.join(managed.state, `${key}.json`);
  const release = await acquireLock(managed.state, key);
  const emitted: Array<OperationalSignalEpisodeResult["emitted"][number]> = [];
  try {
    let state = await readState(stateFile, key);
    const flushed = await flushPending(
      input.stateDirectory,
      stateFile,
      state,
      emitted,
    );
    state = flushed.state;

    const occurredAtMs = Date.parse(input.occurredAt);
    if (!Number.isFinite(occurredAtMs)) {
      throw new Error("operational_signal_episode_occurred_at_invalid");
    }
    const occurredAt = new Date(occurredAtMs).toISOString();
    if (occurredAt !== input.occurredAt) {
      throw new Error("operational_signal_episode_occurred_at_invalid");
    }

    let signal: OperationalSignalEvidenceV2 | null = null;
    let nextActive: ActiveEpisode | null = state.active;

    if (input.active) {
      const severity = input.severity;
      if (severity !== "warning" && severity !== "critical") {
        throw new Error("operational_signal_episode_severity_required");
      }
      const reasonCodes = input.reasonCodes ?? [];
      if (state.active === null) {
        signal = createOperationalSignalEpisodeEvidence({
          signalType: input.signalType,
          component: input.component,
          sourceUnit: input.sourceUnit,
          severity,
          lifecycle: "firing",
          episodeId: randomUUID(),
          episodeSequence: 1,
          occurredAt,
          dedupeWindowSeconds: input.dedupeWindowSeconds,
          reasonCodes,
          measurements: input.measurements,
        });
        nextActive = activeFromSignal(signal);
      } else {
        const candidate = createOperationalSignalEpisodeEvidence({
          signalType: input.signalType,
          component: input.component,
          sourceUnit: input.sourceUnit,
          severity,
          lifecycle: "updated",
          episodeId: state.active.episodeId,
          episodeSequence: state.active.episodeSequence + 1,
          occurredAt,
          dedupeWindowSeconds: input.dedupeWindowSeconds,
          reasonCodes,
          measurements: input.measurements,
        });
        if (!sameIncident(state.active, candidate)) {
          signal = candidate;
          nextActive = activeFromSignal(candidate);
        }
      }
    } else if (state.active !== null) {
      signal = createOperationalSignalEpisodeEvidence({
        signalType: input.signalType,
        component: input.component,
        sourceUnit: input.sourceUnit,
        severity: state.active.severity,
        lifecycle: "resolved",
        episodeId: state.active.episodeId,
        episodeSequence: state.active.episodeSequence + 1,
        occurredAt,
        dedupeWindowSeconds: input.dedupeWindowSeconds,
        reasonCodes: state.active.reasonCodes,
        measurements: input.measurements,
      });
      nextActive = null;
    }

    if (signal) {
      const staged = pendingState(state, signal, nextActive);
      await atomicWriteJson(stateFile, staged);
      const queued = await enqueueOperationalSignal(input.stateDirectory, signal);
      emitted.push({
        signalId: signal.signalId,
        lifecycle: signal.lifecycle,
        episodeId: signal.episodeId,
        episodeSequence: signal.episodeSequence,
        replayed: queued.replayed,
      });
      state = settledState(staged, nextActive);
      await atomicWriteJson(stateFile, state);
    }

    return Object.freeze({
      detectorKey: key,
      activeEpisodeId: state.active?.episodeId ?? null,
      recoveredPending: flushed.recovered,
      emitted: Object.freeze(emitted),
    });
  } finally {
    await release();
  }
}
