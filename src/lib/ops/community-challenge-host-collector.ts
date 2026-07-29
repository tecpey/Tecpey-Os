import { createHash, createHmac } from "node:crypto";
import type { Stats } from "node:fs";
import path from "node:path";
import {
  finalizeCommunityChallengeHostEvidence,
  type CommunityChallengeHostEvidence,
  type HostEvidenceAlertProbe,
  type HostEvidenceEnvironment,
  type HostEvidenceLatestRun,
  type HostEvidenceSystemdUnit,
} from "@/lib/ops/community-challenge-host-evidence";

const GIT_SHA_RE = /^[0-9a-f]{40}$/;
const USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const MAX_COMMAND_OUTPUT_BYTES = 32 * 1024;
const MAX_HEALTH_BODY_BYTES = 128 * 1024;

const UNITS = {
  finalizerService: "tecpey-community-challenge-finalizer.service",
  finalizerTimer: "tecpey-community-challenge-finalizer.timer",
  alertService: "tecpey-ops-alert-delivery.service",
  alertTimer: "tecpey-ops-alert-delivery.timer",
} as const;

export type CommunityChallengeHostDatabaseEvidence = {
  migration0050Applied: boolean;
  latestRun: HostEvidenceLatestRun | null;
};

export type CommunityChallengeHostCollectorOptions = {
  environment: HostEvidenceEnvironment;
  productionAcknowledged?: boolean;
  expectedReleaseSha: string;
  sourceDirectory: string;
  applicationDirectory: string;
  environmentFile: string;
  stateDirectory: string;
  systemdDirectory: string;
  npmBinary: string;
  expectedUser: string;
  expectedGroup: string;
  healthUrl: string;
  hostFingerprintKey: string;
  runAlertProbe?: boolean;
};

export type CommunityChallengeHostCollectorDependencies = {
  lstat(filePath: string): Promise<Stats>;
  readFile(filePath: string): Promise<string>;
  readdir(directory: string): Promise<Array<{
    name: string;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }>>;
  runCommand(command: string, args: string[], timeoutMs: number): Promise<string>;
  fetchHealth(url: string, timeoutMs: number): Promise<{ status: number; body: string }>;
  readDatabaseEvidence(): Promise<CommunityChallengeHostDatabaseEvidence>;
  runAlertProbe(): Promise<HostEvidenceAlertProbe>;
  now(): Date;
  hostname(): string;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedOutput(value: string, code: string): string {
  if (Buffer.byteLength(value) > MAX_COMMAND_OUTPUT_BYTES) throw new Error(code);
  return value.replace(/[\r\n]+$/g, "");
}

function absolute(value: string, code: string): string {
  if (
    typeof value !== "string" ||
    value.length < 2 ||
    value.length > 500 ||
    value.includes("\0") ||
    !path.isAbsolute(value)
  ) {
    throw new Error(code);
  }
  const normalized = path.normalize(value);
  if (normalized === path.parse(normalized).root) throw new Error(code);
  return normalized;
}

function user(value: string, code: string): string {
  if (!USER_RE.test(value)) throw new Error(code);
  return value;
}

async function classifyPath(
  deps: CommunityChallengeHostCollectorDependencies,
  filePath: string,
  kind: "file" | "directory",
  privateRequired: boolean,
  code: string,
): Promise<{ mode: string; private: boolean }> {
  const stat = await deps.lstat(filePath);
  if (stat.isSymbolicLink()) throw new Error(`${code}_symlink`);
  if (kind === "file" ? !stat.isFile() : !stat.isDirectory()) {
    throw new Error(`${code}_kind`);
  }
  const modeNumber = stat.mode & 0o777;
  const mode = `0${modeNumber.toString(8).padStart(3, "0")}`;
  const isPrivate = (modeNumber & 0o007) === 0 && (modeNumber & 0o030) === 0;
  if (privateRequired && !isPrivate) throw new Error(`${code}_permissions`);
  return { mode, private: isPrivate };
}

function parseShow(raw: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    const index = line.indexOf("=");
    if (index <= 0) throw new Error("host_evidence_systemctl_output_invalid");
    const key = line.slice(0, index);
    if (!/^[A-Za-z][A-Za-z0-9]+$/.test(key) || key in parsed) {
      throw new Error("host_evidence_systemctl_output_invalid");
    }
    parsed[key] = line.slice(index + 1);
  }
  return parsed;
}

function systemdTime(value: string | undefined): string | null {
  if (!value || value === "n/a" || value === "0") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("host_evidence_systemd_timer_time_invalid");
  return new Date(parsed).toISOString();
}

function renderService(
  template: string,
  options: CommunityChallengeHostCollectorOptions,
): string {
  const replacements: Record<string, string> = {
    "@@RUN_USER@@": options.expectedUser,
    "@@RUN_GROUP@@": options.expectedGroup,
    "@@APP_DIR@@": options.applicationDirectory,
    "@@ENV_FILE@@": options.environmentFile,
    "@@STATE_DIR@@": options.stateDirectory,
    "@@NPM_BIN@@": options.npmBinary,
  };
  let rendered = template;
  for (const [token, replacement] of Object.entries(replacements)) {
    if (/[\r\n\u0000]/.test(replacement)) {
      throw new Error("host_evidence_systemd_replacement_invalid");
    }
    rendered = rendered.replaceAll(token, replacement);
  }
  if (/@@[A-Z_]+@@/.test(rendered)) {
    throw new Error("host_evidence_systemd_placeholder_unresolved");
  }
  return rendered;
}

async function collectUnit(
  deps: CommunityChallengeHostCollectorDependencies,
  options: CommunityChallengeHostCollectorOptions,
  unit: string,
  kind: "service" | "timer",
  expectedContent: string,
): Promise<HostEvidenceSystemdUnit> {
  const installedPath = path.join(options.systemdDirectory, unit);
  const stat = await deps.lstat(installedPath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 10 || stat.size > 256 * 1024) {
    throw new Error("host_evidence_systemd_unit_file_invalid");
  }
  const installedContent = await deps.readFile(installedPath);
  const show = parseShow(boundedOutput(
    await deps.runCommand("systemctl", [
      "show",
      unit,
      "--property=LoadState",
      "--property=ActiveState",
      "--property=SubState",
      "--property=UnitFileState",
      "--property=NextElapseUSecRealtime",
      "--property=LastTriggerUSec",
    ], 10_000),
    "host_evidence_systemctl_output_too_large",
  ));
  if (show.LoadState !== "loaded") throw new Error("host_evidence_systemd_unit_not_loaded");
  const expectedSha256 = sha256(expectedContent);
  const installedSha256 = sha256(installedContent);
  return {
    unit,
    kind,
    enabled: show.UnitFileState === "enabled",
    active: show.ActiveState === "active",
    activeState: show.ActiveState || "unknown",
    subState: show.SubState || "unknown",
    unitFileState: show.UnitFileState || "unknown",
    nextElapseAt: kind === "timer" ? systemdTime(show.NextElapseUSecRealtime) : null,
    lastTriggerAt: kind === "timer" ? systemdTime(show.LastTriggerUSec) : null,
    expectedSha256,
    installedSha256,
    matchesExpected: expectedSha256 === installedSha256,
  };
}

function parseHealth(status: number, rawBody: string): CommunityChallengeHostEvidence["health"] {
  if (status !== 200) throw new Error("host_evidence_health_http_invalid");
  if (Buffer.byteLength(rawBody) > MAX_HEALTH_BODY_BYTES) {
    throw new Error("host_evidence_health_body_too_large");
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new Error("host_evidence_health_json_invalid");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("host_evidence_health_json_invalid");
  }
  const root = body as Record<string, unknown>;
  const checks = root.checks as Record<string, unknown> | undefined;
  const build = root.build as Record<string, unknown> | undefined;
  const migrations = root.migrations as Record<string, unknown> | undefined;
  if (
    root.ok !== true ||
    root.health !== "ok" ||
    root.service !== "tecpey-web" ||
    root.environment !== "production" ||
    !checks || checks.database !== "ok" || checks.redis !== "ok" ||
    !build || typeof build.commit !== "string" || !GIT_SHA_RE.test(build.commit) ||
    !migrations || migrations.status !== "tracked" ||
    !Number.isSafeInteger(migrations.applied) || Number(migrations.applied) < 1
  ) {
    throw new Error("host_evidence_health_contract_invalid");
  }
  return {
    httpStatus: 200,
    ok: true,
    health: "ok",
    service: "tecpey-web",
    environment: "production",
    commit: build.commit,
    database: "ok",
    redis: "ok",
    migrationsStatus: "tracked",
    migrationsApplied: Number(migrations.applied),
  };
}

function healthUrl(value: string): string {
  if (typeof value !== "string" || value.length < 10 || value.length > 2_048) {
    throw new Error("host_evidence_health_url_invalid");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("host_evidence_health_url_invalid");
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error("host_evidence_health_url_invalid");
  }
  const loopbackHttp = parsed.protocol === "http:" &&
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1");
  if (parsed.protocol !== "https:" && !loopbackHttp) {
    throw new Error("host_evidence_health_https_required");
  }
  return parsed.toString();
}

async function gitSha(
  deps: CommunityChallengeHostCollectorDependencies,
  directory: string,
  code: string,
): Promise<string> {
  const value = boundedOutput(
    await deps.runCommand("git", ["-C", directory, "rev-parse", "HEAD"], 10_000),
    `${code}_output_too_large`,
  ).trim().toLowerCase();
  if (!GIT_SHA_RE.test(value)) throw new Error(code);
  return value;
}

async function requireClean(
  deps: CommunityChallengeHostCollectorDependencies,
  directory: string,
  code: string,
): Promise<void> {
  const value = boundedOutput(
    await deps.runCommand(
      "git",
      ["-C", directory, "status", "--porcelain", "--untracked-files=no"],
      10_000,
    ),
    `${code}_output_too_large`,
  );
  if (value.trim() !== "") throw new Error(code);
}

async function spoolCount(
  deps: CommunityChallengeHostCollectorDependencies,
  directory: string,
): Promise<number> {
  const entries = await deps.readdir(directory);
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile() || !/^[0-9a-f]{64}\.json$/.test(entry.name)) {
      throw new Error("host_evidence_spool_entry_invalid");
    }
  }
  return entries.length;
}

export async function collectCommunityChallengeHostEvidence(
  raw: CommunityChallengeHostCollectorOptions,
  deps: CommunityChallengeHostCollectorDependencies,
): Promise<CommunityChallengeHostEvidence> {
  if (raw.environment !== "staging" && raw.environment !== "production") {
    throw new Error("host_evidence_environment_invalid");
  }
  if (raw.environment === "production" && raw.productionAcknowledged !== true) {
    throw new Error("host_evidence_production_ack_required");
  }
  const expectedReleaseSha = raw.expectedReleaseSha.trim().toLowerCase();
  if (!GIT_SHA_RE.test(expectedReleaseSha)) throw new Error("host_evidence_release_sha_invalid");
  const options: CommunityChallengeHostCollectorOptions = {
    ...raw,
    expectedReleaseSha,
    sourceDirectory: absolute(raw.sourceDirectory, "host_evidence_source_directory_invalid"),
    applicationDirectory: absolute(raw.applicationDirectory, "host_evidence_application_directory_invalid"),
    environmentFile: absolute(raw.environmentFile, "host_evidence_environment_file_invalid"),
    stateDirectory: absolute(raw.stateDirectory, "host_evidence_state_directory_invalid"),
    systemdDirectory: absolute(raw.systemdDirectory, "host_evidence_systemd_directory_invalid"),
    npmBinary: absolute(raw.npmBinary, "host_evidence_npm_binary_invalid"),
    expectedUser: user(raw.expectedUser, "host_evidence_user_invalid"),
    expectedGroup: user(raw.expectedGroup, "host_evidence_group_invalid"),
    healthUrl: healthUrl(raw.healthUrl),
  };
  if (options.expectedUser === "root") throw new Error("host_evidence_root_user_forbidden");
  if (raw.hostFingerprintKey.length < 32 || raw.hostFingerprintKey.length > 4_096) {
    throw new Error("host_evidence_host_key_invalid");
  }

  const started = deps.now();
  if (!Number.isFinite(started.getTime())) throw new Error("host_evidence_clock_invalid");

  await classifyPath(deps, options.sourceDirectory, "directory", false, "host_evidence_source_directory");
  await classifyPath(deps, options.applicationDirectory, "directory", false, "host_evidence_application_directory");
  const environmentClassification = await classifyPath(
    deps,
    options.environmentFile,
    "file",
    true,
    "host_evidence_environment_file",
  );
  const stateClassification = await classifyPath(
    deps,
    options.stateDirectory,
    "directory",
    true,
    "host_evidence_state_directory",
  );
  await classifyPath(deps, options.systemdDirectory, "directory", false, "host_evidence_systemd_directory");
  const npmStat = await deps.lstat(options.npmBinary);
  if (npmStat.isSymbolicLink() || !npmStat.isFile() || (npmStat.mode & 0o111) === 0) {
    throw new Error("host_evidence_npm_binary_invalid");
  }

  const observedSourceSha = await gitSha(deps, options.sourceDirectory, "host_evidence_source_sha_invalid");
  const observedApplicationSha = await gitSha(
    deps,
    options.applicationDirectory,
    "host_evidence_application_sha_invalid",
  );
  await requireClean(deps, options.sourceDirectory, "host_evidence_source_worktree_dirty");
  await requireClean(deps, options.applicationDirectory, "host_evidence_application_worktree_dirty");

  const currentUser = boundedOutput(
    await deps.runCommand("id", ["-un"], 5_000),
    "host_evidence_identity_output_too_large",
  ).trim();
  const currentGroup = boundedOutput(
    await deps.runCommand("id", ["-gn"], 5_000),
    "host_evidence_identity_output_too_large",
  ).trim();
  if (currentUser !== options.expectedUser || currentGroup !== options.expectedGroup) {
    throw new Error("host_evidence_runtime_identity_mismatch");
  }

  const templateRoot = path.join(options.sourceDirectory, "deploy", "systemd");
  const expected = {
    finalizerService: renderService(
      await deps.readFile(path.join(templateRoot, `${UNITS.finalizerService}.in`)),
      options,
    ),
    finalizerTimer: await deps.readFile(path.join(templateRoot, UNITS.finalizerTimer)),
    alertService: renderService(
      await deps.readFile(path.join(templateRoot, `${UNITS.alertService}.in`)),
      options,
    ),
    alertTimer: await deps.readFile(path.join(templateRoot, UNITS.alertTimer)),
  };

  const [finalizerService, finalizerTimer, alertDeliveryService, alertDeliveryTimer] =
    await Promise.all([
      collectUnit(deps, options, UNITS.finalizerService, "service", expected.finalizerService),
      collectUnit(deps, options, UNITS.finalizerTimer, "timer", expected.finalizerTimer),
      collectUnit(deps, options, UNITS.alertService, "service", expected.alertService),
      collectUnit(deps, options, UNITS.alertTimer, "timer", expected.alertTimer),
    ]);

  const healthResponse = await deps.fetchHealth(options.healthUrl, 5_000);
  const health = parseHealth(healthResponse.status, healthResponse.body);
  const database = await deps.readDatabaseEvidence();
  if (!database.migration0050Applied) throw new Error("host_evidence_migration_0050_missing");

  const alertProbe = raw.runAlertProbe ? await deps.runAlertProbe() : null;
  const spoolRoot = path.join(options.stateDirectory, "alerts");
  const spool = {
    pending: await spoolCount(deps, path.join(spoolRoot, "pending")),
    delivered: await spoolCount(deps, path.join(spoolRoot, "delivered")),
    quarantine: await spoolCount(deps, path.join(spoolRoot, "quarantine")),
  };

  const collected = deps.now();
  if (!Number.isFinite(collected.getTime()) || collected.getTime() < started.getTime()) {
    throw new Error("host_evidence_clock_invalid");
  }
  const host = deps.hostname();
  if (!host || host.length > 255 || /[\u0000-\u001f\u007f]/.test(host)) {
    throw new Error("host_evidence_hostname_invalid");
  }

  return finalizeCommunityChallengeHostEvidence({
    schemaVersion: 1,
    collectorVersion: "community-challenge-staging-host-evidence-v1",
    environment: options.environment,
    collectionStartedAt: started.toISOString(),
    collectedAt: collected.toISOString(),
    expectedReleaseSha,
    observedSourceSha,
    observedApplicationSha,
    applicationWorkingTreeClean: true,
    hostFingerprint: createHmac("sha256", raw.hostFingerprintKey).update(host).digest("hex"),
    runtime: {
      currentUser,
      currentGroup,
      expectedUser: options.expectedUser,
      expectedGroup: options.expectedGroup,
      identityMatches: true,
      environmentFile: {
        kind: "regular_file",
        symlink: false,
        mode: environmentClassification.mode,
        private: true,
      },
      stateDirectory: {
        kind: "directory",
        symlink: false,
        mode: stateClassification.mode,
        private: true,
      },
    },
    systemd: {
      finalizerService,
      finalizerTimer,
      alertDeliveryService,
      alertDeliveryTimer,
    },
    health,
    database: { migration0050Applied: true, latestRun: database.latestRun },
    spool,
    alertProbe,
  });
}
