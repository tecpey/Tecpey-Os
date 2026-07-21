import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  open,
  readdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import type { Dirent } from "node:fs";
import {
  collectCommunityChallengeHostEvidence,
  type CommunityChallengeHostCollectorDependencies,
} from "../src/lib/ops/community-challenge-host-collector";
import { readCommunityChallengeHostDatabaseEvidence } from "../src/lib/ops/community-challenge-host-evidence-db";
import {
  deliverOperationalAlerts,
  enqueueOperationalAlert,
} from "../src/lib/ops/operational-alert-spool";
import type {
  OperationalAlertEvidence,
  OperationalJobRunEvidence,
} from "../src/lib/ops/operational-job-evidence";

const MAX_ENV_FILE_BYTES = 64 * 1024;
const MAX_HEALTH_BODY_BYTES = 128 * 1024;
const PRODUCTION_ACK = "I_ACKNOWLEDGE_PRODUCTION_EVIDENCE_COLLECTION";

function required(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name.toLowerCase()}_required`);
  return value;
}

function flag(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  throw new Error(`${name.toLowerCase()}_invalid`);
}

function absolutePath(name: string, fallback?: string): string {
  const value = (process.env[name]?.trim() || fallback || "");
  if (
    !path.isAbsolute(value) ||
    path.normalize(value) === path.parse(path.normalize(value)).root ||
    value.length > 500 ||
    value.includes("\0")
  ) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return path.normalize(value);
}

async function parseRuntimeEnvironment(filePath: string): Promise<Map<string, string>> {
  const stat = await lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 1 || stat.size > MAX_ENV_FILE_BYTES) {
    throw new Error("host_evidence_environment_file_unsafe");
  }
  const content = await readFile(filePath, "utf8");
  const values = new Map<string, string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=([^\s]*)$/.exec(line);
    if (!match || match[2] === "" || values.has(match[1])) {
      throw new Error("host_evidence_environment_file_format_invalid");
    }
    values.set(match[1], match[2]);
  }
  return values;
}

function requiredRuntimeValue(values: Map<string, string>, name: string): string {
  const value = values.get(name) ?? "";
  if (!value || value.includes("CHANGE_ME")) {
    throw new Error(`host_evidence_runtime_${name.toLowerCase()}_required`);
  }
  return value;
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 32 * 1024,
        encoding: "utf8",
        windowsHide: true,
        env: {
          PATH: process.env.PATH,
          LANG: "C",
          LC_ALL: "C",
        },
      },
      (error, stdout) => {
        if (error) {
          reject(new Error("host_evidence_command_failed"));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function readBoundedBody(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared) {
    const parsed = Number(declared);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_HEALTH_BODY_BYTES) {
      throw new Error("host_evidence_health_body_too_large");
    }
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > MAX_HEALTH_BODY_BYTES) {
        throw new Error("host_evidence_health_body_too_large");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

async function fetchHealth(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    return { status: response.status, body: await readBoundedBody(response) };
  } catch (error) {
    if (error instanceof Error && error.message === "host_evidence_health_body_too_large") {
      throw error;
    }
    throw new Error("host_evidence_health_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const parent = path.dirname(filePath);
  const parentStat = await lstat(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error("host_evidence_output_parent_unsafe");
  }
  if (await lstat(filePath).catch(() => null)) {
    throw new Error("host_evidence_output_exists");
  }
  const temporary = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, filePath);
    await chmod(filePath, 0o600);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function runStagingAlertProbe(
  stateDirectory: string,
  webhookUrl: string,
  bearerToken: string | null,
): Promise<{
  requested: true;
  alertId: string;
  enqueuedAt: string;
  deliveredAt: string;
  delivered: true;
  pendingDuplicate: false;
}> {
  const runId = randomUUID();
  const enqueuedAt = new Date().toISOString();
  const run: OperationalJobRunEvidence = {
    runId,
    jobName: "staging-alert-verification",
    schedulerUnit: "tecpey-staging-evidence.service",
    hostName: "staging-evidence-probe",
    resultStatus: "partial_failure",
    startedAt: enqueuedAt,
    completedAt: enqueuedAt,
    batchesProcessed: 0,
    selectedCount: 0,
    finalizedCompletedCount: 0,
    finalizedNotCompletedCount: 0,
    failureCount: 0,
    drainLimitReached: false,
    failureFingerprints: [],
    reasonCodes: ["staging_verification_probe"],
  };
  const alert: OperationalAlertEvidence = {
    schemaVersion: 1,
    alertId: `${run.jobName}:${run.runId}`,
    run,
    severity: "warning",
    occurredAt: enqueuedAt,
  };
  const queued = await enqueueOperationalAlert(stateDirectory, alert);
  const fileName = path.basename(queued.filePath);
  await deliverOperationalAlerts({
    stateDirectory,
    webhookUrl,
    bearerToken,
    limit: 100,
    timeoutMs: 10_000,
    maxAttempts: 10,
  });
  const pendingPath = path.join(stateDirectory, "alerts", "pending", fileName);
  const deliveredPath = path.join(stateDirectory, "alerts", "delivered", fileName);
  const deliveredStat = await lstat(deliveredPath).catch(() => null);
  const pendingStat = await lstat(pendingPath).catch(() => null);
  if (!deliveredStat?.isFile() || deliveredStat.isSymbolicLink() || pendingStat !== null) {
    throw new Error("host_evidence_alert_probe_not_delivered");
  }
  return {
    requested: true,
    alertId: alert.alertId,
    enqueuedAt,
    deliveredAt: new Date().toISOString(),
    delivered: true,
    pendingDuplicate: false,
  };
}

async function main(): Promise<void> {
  const environment = required("TECPEY_EVIDENCE_ENVIRONMENT");
  if (environment !== "staging" && environment !== "production") {
    throw new Error("tecpey_evidence_environment_invalid");
  }
  const environmentFile = absolutePath("TECPEY_EVIDENCE_ENV_FILE");
  const runtime = await parseRuntimeEnvironment(environmentFile);
  const databaseUrl = requiredRuntimeValue(runtime, "DATABASE_URL");
  const hostFingerprintKey = requiredRuntimeValue(runtime, "TECPEY_HOST_EVIDENCE_KEY");
  const webhookUrl = runtime.get("TECPEY_OPS_ALERT_WEBHOOK_URL") ?? "";
  const bearerToken = runtime.get("TECPEY_OPS_ALERT_BEARER_TOKEN") ?? null;
  const runAlertProbe = flag("TECPEY_EVIDENCE_RUN_ALERT_PROBE");
  if (runAlertProbe && !webhookUrl) {
    throw new Error("host_evidence_alert_webhook_required");
  }
  process.env.DATABASE_URL = databaseUrl;
  const outputFile = absolutePath("TECPEY_EVIDENCE_OUTPUT");
  const productionAcknowledged =
    process.env.TECPEY_EVIDENCE_PRODUCTION_ACK === PRODUCTION_ACK;

  const dependencies: CommunityChallengeHostCollectorDependencies = {
    lstat,
    readFile: (filePath) => readFile(filePath, "utf8"),
    readdir: async (directory) =>
      readdir(directory, { withFileTypes: true }) as Promise<Dirent[]>,
    runCommand,
    fetchHealth,
    readDatabaseEvidence: () => readCommunityChallengeHostDatabaseEvidence(databaseUrl),
    runAlertProbe: () => runStagingAlertProbe(
      absolutePath("TECPEY_EVIDENCE_STATE_DIR"),
      webhookUrl,
      bearerToken,
    ),
    now: () => new Date(),
    hostname,
  };

  const evidence = await collectCommunityChallengeHostEvidence({
    environment,
    productionAcknowledged,
    expectedReleaseSha: required("TECPEY_EVIDENCE_EXPECTED_SHA"),
    sourceDirectory: absolutePath("TECPEY_EVIDENCE_SOURCE_DIR"),
    applicationDirectory: absolutePath("TECPEY_EVIDENCE_APP_DIR"),
    environmentFile,
    stateDirectory: absolutePath("TECPEY_EVIDENCE_STATE_DIR"),
    systemdDirectory: absolutePath("TECPEY_EVIDENCE_SYSTEMD_DIR", "/etc/systemd/system"),
    npmBinary: absolutePath("TECPEY_EVIDENCE_NPM_BIN"),
    expectedUser: required("TECPEY_EVIDENCE_RUN_USER"),
    expectedGroup: required("TECPEY_EVIDENCE_RUN_GROUP"),
    healthUrl: required("TECPEY_EVIDENCE_HEALTH_URL"),
    hostFingerprintKey,
    runAlertProbe,
  }, dependencies);

  const content = `${JSON.stringify(evidence, null, 2)}\n`;
  const fileDigest = createHash("sha256").update(content).digest("hex");
  await atomicWrite(outputFile, content);
  await atomicWrite(
    `${outputFile}.sha256`,
    `${fileDigest}  ${path.basename(outputFile)}\n`,
  );
  console.log(JSON.stringify({
    ok: true,
    environment: evidence.environment,
    releaseSha: evidence.expectedReleaseSha,
    collectedAt: evidence.collectedAt,
    alertProbeDelivered: Boolean(evidence.alertProbe?.delivered),
    evidenceFile: path.basename(outputFile),
    digestFile: `${path.basename(outputFile)}.sha256`,
  }));
}

void main().catch((error) => {
  const code = error instanceof Error && /^[a-z0-9._:-]{3,160}$/.test(error.message)
    ? error.message
    : "host_evidence_collection_failed";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
