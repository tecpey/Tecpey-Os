import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import {
  deliverOperationalAlerts,
  enqueueOperationalAlert,
  ensureOperationalSpoolDirectories,
} from "../src/lib/ops/operational-alert-spool";
import type { OperationalAlertEvidence } from "../src/lib/ops/operational-job-evidence";
import { verifyIncidentReadinessEvidence } from "./verify-incident-readiness-evidence.mjs";
import {
  acknowledgementLatencySeconds,
  acknowledgementTargetSeconds,
  buildRunbookCoverage,
  normalizedIso,
  queueStateDigest,
  sha256Canonical,
  supportWindowContext,
} from "./protected-incident-readiness-collector-policy.mjs";

const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SAFE_IDENTITY = /^[A-Za-z0-9._:@-]{3,120}$/;
const SAFE_SPOOL_FILE = /^[a-f0-9]{64}\.json$/;
const MAX_ENV_FILE_BYTES = 64 * 1024;

function required(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name.toLowerCase()}_required`);
  return value;
}

function safeAbsolutePath(name: string): string {
  const value = required(name);
  if (
    !path.isAbsolute(value)
    || value.length > 500
    || value.includes("\0")
    || path.normalize(value) === path.parse(path.normalize(value)).root
  ) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return path.normalize(value);
}

function identity(name: string): string {
  const value = required(name);
  if (!SAFE_IDENTITY.test(value)) throw new Error(`${name.toLowerCase()}_invalid`);
  return value;
}

async function parseRuntimeEnvironment(filePath: string): Promise<Map<string, string>> {
  const stat = await lstat(filePath);
  if (
    stat.isSymbolicLink()
    || !stat.isFile()
    || stat.size < 1
    || stat.size > MAX_ENV_FILE_BYTES
    || (stat.mode & 0o022) !== 0
  ) {
    throw new Error("incident_environment_file_unsafe");
  }
  const values = new Map<string, string>();
  for (const rawLine of (await readFile(filePath, "utf8")).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=([^\s]*)$/.exec(line);
    if (!match || match[2] === "" || values.has(match[1])) {
      throw new Error("incident_environment_file_format_invalid");
    }
    values.set(match[1], match[2]);
  }
  return values;
}

function runtimeValue(values: Map<string, string>, name: string): string {
  const value = values.get(name)?.trim() ?? "";
  if (!value) throw new Error(`incident_${name.toLowerCase()}_missing`);
  return value;
}

async function countSafeSpoolFiles(directory: string): Promise<number> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile() || !SAFE_SPOOL_FILE.test(entry.name)) {
      throw new Error("incident_spool_entry_invalid");
    }
  }
  return entries.length;
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const parent = await lstat(path.dirname(filePath));
  if (parent.isSymbolicLink() || !parent.isDirectory() || (parent.mode & 0o077) !== 0) {
    throw new Error("incident_evidence_directory_unsafe");
  }
  await chmod(path.dirname(filePath), 0o700);
  const temporary = path.join(
    path.dirname(filePath),
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

async function runCriticalProbe(input: {
  stateDirectory: string;
  webhookUrl: string;
  bearerToken: string | null;
  deliveryChannelDigest: string;
}) {
  const runId = randomUUID();
  const triggeredAt = new Date().toISOString();
  const alert: OperationalAlertEvidence = {
    schemaVersion: 1,
    alertId: `incident-readiness-verification:${runId}`,
    run: {
      runId,
      jobName: "incident-readiness-verification",
      schedulerUnit: "tecpey-ops-alert-delivery.service",
      hostName: "protected-staging-runner",
      resultStatus: "authority_unavailable",
      startedAt: triggeredAt,
      completedAt: triggeredAt,
      batchesProcessed: 0,
      selectedCount: 0,
      finalizedCompletedCount: 0,
      finalizedNotCompletedCount: 0,
      failureCount: 0,
      drainLimitReached: false,
      failureFingerprints: [],
      reasonCodes: ["synthetic_critical_alert_probe"],
    },
    severity: "critical",
    occurredAt: triggeredAt,
  };
  const queued = await enqueueOperationalAlert(input.stateDirectory, alert);
  if (queued.replayed) throw new Error("incident_probe_replay_forbidden");
  const summary = await deliverOperationalAlerts({
    stateDirectory: input.stateDirectory,
    webhookUrl: input.webhookUrl,
    bearerToken: input.bearerToken,
    limit: 100,
    timeoutMs: 10_000,
    maxAttempts: 1,
  });
  if (
    summary.selected !== 1
    || summary.delivered !== 1
    || summary.retryable !== 0
    || summary.quarantined !== 0
    || summary.skippedUntilLater !== 0
  ) {
    throw new Error("incident_probe_delivery_invalid");
  }
  const deliveredAt = new Date().toISOString();
  const latencySeconds = Math.floor((Date.parse(deliveredAt) - Date.parse(triggeredAt)) / 1000);
  if (latencySeconds < 0 || latencySeconds > 300) throw new Error("incident_probe_latency_invalid");
  const managed = await ensureOperationalSpoolDirectories(input.stateDirectory);
  const pendingAlertCountAfterProbe = await countSafeSpoolFiles(managed.pending);
  const quarantineCountAfterProbe = await countSafeSpoolFiles(managed.quarantine);
  if (pendingAlertCountAfterProbe !== 0 || quarantineCountAfterProbe !== 0) {
    throw new Error("incident_probe_queue_state_invalid");
  }
  const expectedFile = `${createHash("sha256").update(alert.alertId).digest("hex")}.json`;
  const delivered = await lstat(path.join(managed.delivered, expectedFile)).catch(() => null);
  if (!delivered?.isFile() || delivered.isSymbolicLink()) {
    throw new Error("incident_probe_archive_missing");
  }
  return {
    probeId: alert.alertId,
    severity: "P0",
    alertType: "synthetic-critical-alert",
    triggeredAt,
    deliveredAt,
    latencySeconds,
    deliveryChannelDigest: input.deliveryChannelDigest,
    pendingAlertCountAfterProbe,
    quarantineCountAfterProbe,
    disposition: "accepted",
  };
}

async function main(): Promise<void> {
  if (required("TECPEY_INCIDENT_ACKNOWLEDGEMENTS_CONFIRMED") !== "1") {
    throw new Error("incident_acknowledgements_not_confirmed");
  }
  if (required("TECPEY_INCIDENT_INDEPENDENT_REVIEW_CONFIRMED") !== "1") {
    throw new Error("incident_independent_review_not_confirmed");
  }
  const sourceSha = required("TECPEY_INCIDENT_SOURCE_SHA").toLowerCase();
  if (!COMMIT_SHA.test(sourceSha)) throw new Error("incident_source_sha_invalid");
  const operator = identity("TECPEY_INCIDENT_OPERATOR");
  const reviewer = identity("TECPEY_INCIDENT_REVIEWER");
  const incidentCommander = identity("TECPEY_INCIDENT_COMMANDER");
  const sreOwner = identity("TECPEY_INCIDENT_SRE_OWNER");
  if ([operator, incidentCommander, sreOwner].some(
    (value) => value.toLowerCase() === reviewer.toLowerCase(),
  )) {
    throw new Error("incident_reviewer_must_be_independent");
  }

  const declaredAt = normalizedIso(required("TECPEY_INCIDENT_DECLARED_AT"), "incident_declared_at");
  const incidentCommanderAcknowledgedAt = normalizedIso(
    required("TECPEY_INCIDENT_COMMANDER_ACKNOWLEDGED_AT"),
    "incident_commander_acknowledged_at",
  );
  const sreAcknowledgedAt = normalizedIso(
    required("TECPEY_INCIDENT_SRE_ACKNOWLEDGED_AT"),
    "incident_sre_acknowledged_at",
  );
  const context = supportWindowContext(declaredAt);
  const ackTargetSeconds = acknowledgementTargetSeconds(context);
  const incidentCommanderLatencySeconds = acknowledgementLatencySeconds(
    declaredAt,
    incidentCommanderAcknowledgedAt,
    "incident_commander",
  );
  const sreLatencySeconds = acknowledgementLatencySeconds(declaredAt, sreAcknowledgedAt, "sre");
  if (
    incidentCommanderLatencySeconds > ackTargetSeconds
    || sreLatencySeconds > ackTargetSeconds
  ) {
    throw new Error("incident_acknowledgement_target_missed");
  }
  const now = Date.now();
  if (
    now - Date.parse(declaredAt) > 2 * 60 * 60_000
    || Date.parse(declaredAt) > now + 60_000
    || Date.parse(incidentCommanderAcknowledgedAt) > now + 60_000
    || Date.parse(sreAcknowledgedAt) > now + 60_000
  ) {
    throw new Error("incident_acknowledgement_freshness_invalid");
  }

  const environmentFile = safeAbsolutePath("TECPEY_INCIDENT_ENV_FILE");
  const stateDirectory = safeAbsolutePath("TECPEY_INCIDENT_STATE_DIR");
  const authorityDirectory = safeAbsolutePath("TECPEY_INCIDENT_AUTHORITY_DIR");
  const outputDirectory = safeAbsolutePath("TECPEY_INCIDENT_EVIDENCE_DIR");
  const runtime = await parseRuntimeEnvironment(environmentFile);
  const databaseUrl = runtimeValue(runtime, "DATABASE_URL");
  const webhookUrl = runtimeValue(runtime, "TECPEY_OPS_ALERT_WEBHOOK_URL");
  const parsedWebhook = new URL(webhookUrl);
  if (parsedWebhook.protocol !== "https:" || parsedWebhook.username || parsedWebhook.password) {
    throw new Error("incident_alert_webhook_invalid");
  }
  process.env.DATABASE_URL = databaseUrl;
  const bearerToken = runtime.get("TECPEY_OPS_ALERT_BEARER_TOKEN")?.trim() || null;
  const managed = await ensureOperationalSpoolDirectories(stateDirectory);
  const initialPending = await countSafeSpoolFiles(managed.pending);
  const initialQuarantine = await countSafeSpoolFiles(managed.quarantine);
  if (initialPending !== 0 || initialQuarantine !== 0) {
    throw new Error("incident_initial_queue_state_invalid");
  }

  const deliveryChannelDigest = sha256Canonical({
    authority: "governed-alert-channel-v1",
    endpoint: `${parsedWebhook.origin}${parsedWebhook.pathname}`,
  });
  const alertProbes = [];
  for (let index = 0; index < 2; index += 1) {
    alertProbes.push(await runCriticalProbe({
      stateDirectory,
      webhookUrl,
      bearerToken,
      deliveryChannelDigest,
    }));
  }
  const pendingAlertCount = await countSafeSpoolFiles(managed.pending);
  const quarantineCount = await countSafeSpoolFiles(managed.quarantine);
  if (pendingAlertCount !== 0 || quarantineCount !== 0) {
    throw new Error("incident_final_queue_state_invalid");
  }
  const checkedAt = new Date().toISOString();
  const operationsRunbook = await readFile(
    path.join(authorityDirectory, "docs", "OPERATIONS_RUNBOOK.md"),
    "utf8",
  );

  const evidence = {
    schemaVersion: 1,
    authority: "tecpey-incident-readiness-v1",
    evidenceClass: "protected-staging-incident-readiness",
    environment: "protected-staging",
    sourceSha,
    supportWindow: {
      timezone: "Asia/Tehran",
      dailyStart: "09:00",
      dailyEnd: "23:00",
      coverage: "every-day-controlled-launch",
    },
    incidentOwners: {
      incidentCommander: {
        role: "Founder/CEO or delegated release owner",
        externalIdentity: incidentCommander,
      },
      technicalOwner: {
        role: "CTO or Chief Architect",
        externalIdentity: operator,
      },
      sreOwner: {
        role: "SRE Lead",
        externalIdentity: sreOwner,
      },
      securityOwner: {
        role: "Chief Security Officer or DevSecOps Lead",
        externalIdentity: operator,
      },
      productOwner: {
        role: "CPO or Academy Director",
        externalIdentity: operator,
      },
    },
    alertProbes,
    alertQueueState: {
      checkedAt,
      pendingAlertCount,
      quarantineCount,
      queryDigest: queueStateDigest(pendingAlertCount, quarantineCount),
    },
    acknowledgementDrill: {
      drillId: `p0-ack-drill-${randomUUID()}`,
      severity: "P0",
      declaredAt,
      supportWindowContext: context,
      ackTargetSeconds,
      incidentCommander,
      incidentCommanderAcknowledgedAt,
      incidentCommanderLatencySeconds,
      sreOwner,
      sreAcknowledgedAt,
      sreLatencySeconds,
      disposition: "accepted",
    },
    runbookCoverage: buildRunbookCoverage(operationsRunbook),
    operator: {
      role: "Protected staging workflow operator",
      externalIdentity: operator,
    },
    reviewer: {
      role: "Independent incident readiness reviewer",
      externalIdentity: reviewer,
    },
    privacyBoundary: [
      "redacted-evidence-only",
      "no-secrets-or-connection-urls",
      "no-host-ips",
      "no-raw-logs",
      "no-customer-data",
    ],
    finalDisposition: "accepted",
  };
  verifyIncidentReadinessEvidence(evidence, sourceSha);

  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  await chmod(outputDirectory, 0o700);
  const evidenceFile = path.join(
    outputDirectory,
    `protected-staging-incident-readiness-${sourceSha}.json`,
  );
  const content = `${JSON.stringify(evidence, null, 2)}\n`;
  const digest = createHash("sha256").update(content).digest("hex");
  await atomicWrite(evidenceFile, content);
  await atomicWrite(path.join(outputDirectory, "SHA256SUMS"), `${digest}  ${path.basename(evidenceFile)}\n`);
  console.log(JSON.stringify({
    ok: true,
    sourceSha,
    probes: alertProbes.length,
    maximumProbeLatencySeconds: Math.max(...alertProbes.map((probe) => probe.latencySeconds)),
    pendingAlertCount,
    quarantineCount,
    acknowledgementTargetSeconds: ackTargetSeconds,
    maximumAcknowledgementLatencySeconds: Math.max(
      incidentCommanderLatencySeconds,
      sreLatencySeconds,
    ),
    evidenceDigest: digest,
  }));
}

void main().catch((error) => {
  const code = error instanceof Error && /^[a-z0-9._:-]{3,160}$/.test(error.message)
    ? error.message
    : "protected_incident_readiness_collection_failed";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
