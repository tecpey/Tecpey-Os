import { createHash } from "node:crypto";

const SHA256 = /^[a-f0-9]{64}$/;

export const RUNBOOK_SECTIONS = Object.freeze({
  database: Object.freeze({ failureMode: "Database", heading: "## Incident: Database Down" }),
  redis: Object.freeze({ failureMode: "Redis", heading: "## Incident: Redis Down" }),
  migration: Object.freeze({ failureMode: "Migration", heading: "## Incident: Migration Failure" }),
  alertDelivery: Object.freeze({
    failureMode: "Alert delivery",
    heading: "## Incident: Alert delivery failure",
  }),
  provider: Object.freeze({ failureMode: "Provider", heading: "## Incident: Provider failure" }),
  worker: Object.freeze({ failureMode: "Worker", heading: "## Incident: Worker failure" }),
  reconciliation: Object.freeze({
    failureMode: "Reconciliation",
    heading: "## Incident: Reconciliation failure",
  }),
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

export function sha256Canonical(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export function assertSha256(value, label = "digest") {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label}_invalid`);
  }
  return value;
}

export function normalizedIso(value, label = "timestamp") {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label}_invalid`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(`${label}_invalid`);
  return normalized;
}

export function acknowledgementLatencySeconds(declaredAt, acknowledgedAt, label) {
  const declared = normalizedIso(declaredAt, `${label}_declared_at`);
  const acknowledged = normalizedIso(acknowledgedAt, `${label}_acknowledged_at`);
  const latency = Math.floor((Date.parse(acknowledged) - Date.parse(declared)) / 1000);
  if (latency < 0) throw new Error(`${label}_timestamp_order_invalid`);
  return latency;
}

export function supportWindowContext(value) {
  const timestamp = normalizedIso(value, "support_window_timestamp");
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tehran",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 9 * 60 && minutes <= 23 * 60
    ? "inside-support-window"
    : "outside-support-window";
}

export function acknowledgementTargetSeconds(context) {
  if (context === "inside-support-window") return 900;
  if (context === "outside-support-window") return 3600;
  throw new Error("acknowledgement_context_invalid");
}

export function extractRunbookSection(source, heading) {
  if (typeof source !== "string" || source.length < 100) {
    throw new Error("runbook_source_invalid");
  }
  const start = source.indexOf(heading);
  if (start < 0) throw new Error("runbook_heading_missing");
  const next = source.indexOf("\n## Incident:", start + heading.length);
  const section = source.slice(start, next < 0 ? source.length : next).trim();
  if (
    section.length < 120
    || !section.includes("**Symptom:**")
    || !section.includes("**Diagnosis:**")
    || !section.includes("**Resolution:**")
  ) {
    throw new Error("runbook_section_incomplete");
  }
  return section;
}

export function buildRunbookCoverage(source) {
  return Object.fromEntries(
    Object.entries(RUNBOOK_SECTIONS).map(([key, definition]) => {
      const section = extractRunbookSection(source, definition.heading);
      return [key, {
        failureMode: definition.failureMode,
        firstResponder: "SRE Lead",
        escalationPath: "SRE Lead -> Technical Owner -> Incident Commander",
        rollbackHaltCondition: `${definition.failureMode} launch expansion halt condition`,
        userCommunicationOwner: "Product Owner",
        evidenceDigest: sha256Canonical({ heading: definition.heading, section }),
        disposition: "accepted",
      }];
    }),
  );
}

export function queueStateDigest(pendingAlertCount, quarantineCount) {
  for (const [label, value] of [
    ["pending_alert_count", pendingAlertCount],
    ["quarantine_count", quarantineCount],
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}_invalid`);
  }
  return sha256Canonical({
    authority: "protected-operational-spool-v1",
    pendingAlertCount,
    quarantineCount,
  });
}
