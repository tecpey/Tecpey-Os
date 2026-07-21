import { createHash, createHmac } from "node:crypto";
import path from "node:path";
import type { Stats } from "node:fs";
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

const FINALIZER_SERVICE = "tecpey-community-challenge-finalizer.service";
const FINALIZER_TIMER = "tecpey-community-challenge-finalizer.timer";
const ALERT_SERVICE = "tecpey-ops-alert-delivery.service";
const ALERT_TIMER = "tecpey-ops-alert-delivery.timer";

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
  readdir(directory: string): Promise<Array<{ name: string; isFile(): boolean; isSymbolicLink(): boolean }>>;
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

function strictAbsolutePath(value: string, code: string): string {
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

function strictUser(value: string, code: string): string {
  if (!USER_RE.test(value)) throw new Error(code);
  return value;
}

async function classifyPath(
  deps: CommunityChallengeHostCollectorDependencies,
  filePath: string,
  expectedKind: "file" | "directory",
  code: string,
): Promise<{ mode: string; private: true }> {
  const stat = await deps.lstat(filePath);
  if (stat.isSymbolicLink()) throw new Error(`${code}_symlink`);
  if (expectedKind === "file" ? !stat.isFile() : !stat.isDirectory()) {
    throw new Error(`${code}_kind`);
  }
  const modeNumber = stat.mode & 0o777;
  const mode = `0${modeNumber.toString(8).padStart(3, "0")}`;
  const otherPermissions = modeNumber & 0o007;
  const groupWriteOrExecute = modeNumber & 0o030;
  if (otherPermissions !== 0 || groupWriteOrExecute !== 0) {
    throw new Error(`${code}_permissions`);
  }
  return { mode, private: true };
}

function parseSystemctlShow(raw: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error("host_evidence_systemctl_output_invalid");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!/^[A-Za-z][A-Za-z0-9]+$/.test(key) || key in output) {
      throw new Error("host_evidence_systemctl_output_invalid");
    }
    output[key] = value;
  }
  return output;
}

function systemdTimestamp(value: string | undefined, code: string): string | null {
  if (!value || value === "n/a" || value === "0") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return new Date(parsed).toISOString();
}

function renderServiceTemplate(
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
    if (/\r|\n|\0/.test(replacement)) throw new Error("host_evidence_systemd_replacement_invalid");
    rendered = rendered.replaceAll(token, replacement);
  }
  if (/@@[A-Z_]+@@/.test(rendered)) throw new Error("host_evidence_systemd_placeholder_unresolved");
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
  const show = parseSystemctlShow(
    boundedOutput(
      await deps.runCommand(
        "systemctl",
        [
          "show",
          unit,
          "--property=LoadState",
          "--property=ActiveState",
          "--property=SubState",
          "--property=UnitFileState",
          "--property=NextElapseUSecRealtime",
          "--property=LastTriggerUSec",
        ],
        10_000,
      ),
      "host_evidence_systemctl_output_too_large",
    ),
  );
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
    nextElapseAt: kind === "timer"
      ? systemdTimestamp(show.NextElapseUSecRealtime, "host_evidence_systemd_timer_time_invalid")
      : null,
    lastTriggerAt: kind === "timer"
      ? systemdTimestamp(show.LastTriggerUSec, "host_evidence_systemd_timer_time_invalid")
      : null,
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

function validateHealthUrl(value: string): string {
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
  const output = boundedOutput(
    await deps.runCommand("git", ["-C", directory, "rev-parse", "HEAD"], 10_000),
    `${code}_output_too_large`,
  ).trim().toLowerCase();
  if (!GIT_SHA_RE.test(output)) throw new Error(code);
  return output;
}

async function assertCleanWorktree(
  deps: CommunityChallengeHostCollectorDependencies,
  directory: string,
  code: string,
): Promise<void> {
  const output = boundedOutput(
    await deps.runCommand(
      "git",
      ["-C", directory, "status", "--porcelain", "--untracked-files=no"],
      10_000,
    ),
    `${code}_output_too_large`,
  );
  if (output.trim() !== "") throw new Error(code);
}

async function countSpoolDirectory(
  deps: CommunityChallengeHostCollectorDependencies,
  directory: string,
): Promise<number> {
  const entries = await deps.readdir(directory);
  let count = 0;
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile() || !/^[0-9a-f]{64}\.json$/.test(entry.name)) {
      throw new Error("host_evidence_spool_entry_invalid");
    }
    count += 1;
  }
  return count;
}

export async function collectCommunityChallengeHostEvidence(
  rawOptions: CommunityChallengeHostCollectorOptions,
  deps: CommunityChallengeHostCollectorDependencies,
): Promise<CommunityChallengeHostEvidence> {
  if (
    rawOptions.environment !== "staging" &&
    rawOptions.environment !== "production"
  ) {
    throw new Error("host_evidence_environment_invalid");
  }
  if (rawOptions.environment === "production" && rawOptions.productionAcknowledged !== true) {
    throw new Error("host_evidence_production_ack_required");
  }
  const expectedReleaseSha = rawOptions.expectedReleaseSha.trim().toLowerCase();
  if (!GIT_SHA_RE.test(expectedReleaseSha)) throw new Error("host_evidence_release_sha_invalid");
  const sourceDirectory = strictAbsolutePath(rawOptions.sourceDirectory, "host_evidence_source_directory_invalid");
  const applicationDirectory = strictAbsolutePath(
    rawOptions.applicationDirectory,
    "host_evidence_application_directory_invalid",
  );
  const environmentFile = strictAbsolutePath(rawOptions.environmentFile, "host_evidence_environment_file_invalid");
  const stateDirectory = strictAbsolutePath(rawOptions.stateDirectory, "host_evidence_state_directory_invalid");
  const systemdDirectory = strictAbsolutePath(rawOptions.systemdDirectory, "host_evidence_systemd_directory_invalid");
  const npmBinary = strictAbsolutePath(rawOptions.npmBinary, "host_evidence_npm_binary_invalid");
  const expectedUser = strictUser(rawOptions.expectedUser, "host_evidence_user_invalid");
  const expectedGroup = strictUser(rawOptions.expectedGroup, "host_evidence_group_invalid");
  if (expectedUser === "root") throw new Error("host_evidence_root_user_forbidden");
  if (rawOptions.hostFingerprintKey.length < 32 || rawOptions.hostFingerprintKey.length > 4_096) {
    throw new Error("host_evidence_host_key_invalid");
  }
  const options: CommunityChallengeHostCollectorOptions = {
    ...rawOptions,
    expectedReleaseSha,
    sourceDirectory,
    applicationDirectory,
    environmentFile,
    stateDirectory,
    systemdDirectory,
    npmBinary,
    expectedUser,
    expectedGroup,
    healthUrl: validateHealthUrl(rawOptions.healthUrl),
  };

  const collectionStarted = deps.now();
  if (!Number.isFinite(collectionStarted.getTime())) throw new Error("host_evidence_clock_invalid");

  await classifyPath(deps, sourceDirectory, "directory", "host_evidence_source_directory");
  await classifyPath(deps, applicationDirectory, "directory", "host_evidence_application_directory");
  const environmentClassification = await classifyPath(
    deps,
    environmentFile,
    "file",
    "host_evidence_environment_file",
  );
  const stateClassification = await classifyPath(
    deps,
    stateDirectory,
    "directory",
    "host_evidence_state_directory",
  );
  await classifyPath(deps, systemdDirectory, "directory", "host_evidence_systemd_directory");
  const npmStat = await deps.lstat(npmBinary);
  if (npmStat.isSymbolicLink() || !npmStat.isFile() || (npmStat.mode & 0o111) === 0) {
    throw new Error("host_evidence_npm_binary_invalid");
  }

  const observedSourceSha = await gitSha(deps, sourceDirectory, "host_evidence_source_sha_invalid");
  const observedApplicationSha = await gitSha(
    deps,
    applicationDirectory,
    "host_evidence_application_sha_invalid",
  );
  await assertCleanWorktree(deps, sourceDirectory, "host_evidence_source_worktree_dirty");
  await assertCleanWorktree(deps, applicationDirectory, "host_evidence_application_worktree_dirty");

  const currentUser = boundedOutput(
    await deps.runCommand("id", ["-un"], 5_000),
    "host_evidence_identity_output_too_large",
  ).trim();
  const currentGroup = boundedOutput(
    await deps.runCommand("id", ["-gn"], 5_000),
    "host_evidence_identity_output_too_large",
  ).trim();
  if (currentUser !== expectedUser || currentGroup !== expectedGroup) {
    throw new Error("host_evidence_runtime_identity_mismatch");
  }

  const templateRoot = path.join(sourceDirectory, "deploy", "systemd");
  const finalizerServiceTemplate = renderServiceTemplate(
    await deps.readFile(path.join(templateRoot, `${FINALIZER_SERVICE}.in`)),
    options,
  );
  const alertServiceTemplate = renderServiceTemplate(
    await deps.readFile(path.join(templateRoot, `${ALERT_SERVICE}.in`)),
    options,
  );
  const finalizerTimerTemplate = await deps.readFile(path.join(templateRoot, FINALIZER_TIMER));
  const alertTimerTemplate = await deps.readFile(path.join(templateRoot, ALERT_TIMER));

  const [
    finalizerService,
    finalizerTimer,
    alertDeliveryService,
    alertDeliveryTimer,
  ] = await Promise.all([
    collectUnit(deps, options, FINALIZER_SERVICE, "service", finalizerServiceTemplate),
    collectUnit(deps, options, FINALIZER_TIMER, "timer", finalizerTimerTemplate),
    collectUnit(deps, options, ALERT_SERVICE, "service", alertServiceTemplate),
    collectUnit(deps, options, ALERT_TIMER, "timer", alertTimerTemplate),
  ]);

  const healthResponse = await deps.fetchHealth(options.healthUrl, 5_000);
  const health = parseHealth(healthResponse.status, healthResponse.body);
  const database = await deps.readDatabaseEvidence();
  if (!database.migration0050Applied) throw new Error("host_evidence_migration_0050_missing");

  const spoolRoot = path.join(stateDirectory, "alerts");
  const spool = {
    pending: await countSpoolDirectory(deps, path.join(spoolRoot, "pending")),
    delivered: await countSpoolDirectory(deps, path.join(spoolRoot, "delivered")),
    quarantine: await countSpoolDirectory(deps, path.join(spoolRoot, "quarantine")),
  };
  const alertProbe = rawOptions.runAlertProbe ? await deps.runAlertProbe() : null;
  const collected = deps.now();
  if (!Number.isFinite(collected.getTime()) || collected.getTime() < collectionStarted.getTime()) {
    throw new Error("host_evidence_clock_invalid");
  }
  const rawHostname = deps.hostname();
  if (!rawHostname || rawHostname.length > 255 || /[\u0000-\u001f\u007f]/.test(rawHostname)) {
    throw new Error("host_evidence_hostname_invalid");
  }

  return finalizeCommunityChallengeHostEvidence({
    schemaVersion: 1,
    collectorVersion: "community-challenge-staging-host-evidence-v1",
    environment: options.environment,
    collectionStartedAt: collectionStarted.toISOString(),
    collectedAt: collected.toISOString(),
    expectedReleaseSha,
    observedSourceSha,
    observedApplicationSha,
    applicationWorkingTreeClean: true,
    hostFingerprint: createHmac("sha256", rawOptions.hostFingerprintKey)
      .update(rawHostname)
      .digest("hex"),
    runtime: {
      currentUser,
      currentGroup,
      expectedUser,
      expectedGroup,
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
    database: {
      migration0050Applied: true,
      latestRun: database.latestRun,
    },
    spool,
    alertProbe,
  });
}
