import { readFile } from "node:fs/promises";

const files = {
  readiness: "docs/launch/OPERATIONAL_REDTEAM_READINESS_ISSUE_110_20260820.md",
  recoveryRunbook: "docs/operations/OPERATIONAL_RECOVERY_DRILLS.md",
  recoveryContract: "docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md",
  incidentContract: "docs/operations/INCIDENT_READINESS_CONTRACT.md",
  recoveryWorkflow: ".github/workflows/operational-recovery.yml",
  ciWorkflow: ".github/workflows/ci.yml",
  packageJson: "package.json",
};

const requireText = (failures, source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};

const rejectText = (failures, source, pattern, message) => {
  if (pattern.test(source)) failures.push(message);
};

export function evaluateOperationalRedteamReadiness(source) {
  const failures = [];
  const {
    readiness,
    recoveryRunbook,
    recoveryContract,
    incidentContract,
    recoveryWorkflow,
    ciWorkflow,
    packageJson,
  } = source;

  for (const token of [
    "tecpey-operational-redteam-readiness-v1",
    "Issue: #110",
    "REPOSITORY_READINESS_ADVANCED_PROTECTED_DRILLS_STILL_OPEN",
    "This record advances issue #110",
    "It does not close #110",
    "Exact-head `Scheduled Operational Recovery` workflow",
    "PostgreSQL and Redis isolated restore with measured RPO/RTO",
    "Migration plan hash equality",
    "Late-write exclusion proof for PostgreSQL and Redis",
    "Protected recovery reconciliation verifier",
    "Incident readiness verifier remains separate",
    "Issue #110 remains open",
    "operator and reviewer independence",
    "provider, queue, worker, deployment, and rollback drills",
    "This readiness record does not approve public launch",
    "real-money operations",
    "custody",
    "final Go matrix",
  ]) {
    requireText(failures, readiness, token, `readiness report is missing ${token}`);
  }

  for (const drillFamily of [
    "PostgreSQL and Redis backup/restore",
    "Migration interruption and retry",
    "Database outage, pool exhaustion, lag, deletion",
    "Redis outage, worker crash, stale lease, DLQ",
    "Provider timeout, malformed response, webhook disorder",
    "Deploy, rollback, stale client, secret rotation, kill switch",
  ]) {
    requireText(failures, readiness, drillFamily, `readiness report is missing ${drillFamily}`);
  }

  for (const token of [
    "Do not close #110",
    "Protected staging evidence",
    "Independent operator",
    "RPO",
    "RTO",
    "Halt condition",
    "Ambiguity policy",
  ]) {
    requireText(failures, recoveryRunbook, token, `recovery runbook is missing ${token}`);
  }

  for (const token of [
    "issue #110",
    "protected staging restore",
    "Domain reconciliation matrix",
    "Academy",
    "Trading Arena",
    "Mentor AI",
    "Exchange Ledger",
    "Notifications and operational jobs",
    "Tenant and principal isolation",
    "Do not store raw rows",
  ]) {
    requireText(failures, recoveryContract, token, `recovery contract is missing ${token}`);
  }

  for (const token of [
    "tecpey-incident-readiness-v1",
    "P0 acknowledgement drill",
    "incident commander",
    "SRE owner",
    "reviewer",
    "NOG-07",
  ]) {
    requireText(failures, incidentContract, token, `incident contract is missing ${token}`);
  }

  for (const token of [
    "Scheduled Operational Recovery",
    "pull_request:",
    "schedule:",
    "workflow_dispatch:",
    "git rev-parse HEAD",
    "TECPEY_RECOVERY_SOURCE_SHA",
    "TECPEY_RECOVERY_RTO_SECONDS: '300'",
    "test-container-volume-recovery.sh",
    "verify-operational-recovery-evidence.mjs",
    "verify-protected-recovery-reconciliation-evidence.mjs",
    "retention-days: 30",
  ]) {
    requireText(failures, recoveryWorkflow, ` ${token}`.trim(), `recovery workflow is missing ${token}`);
  }

  requireText(
    failures,
    ciWorkflow,
    "Operational Red Team drill readiness guard",
    "CI must run the operational Red Team readiness guard",
  );
  requireText(
    failures,
    ciWorkflow,
    "npm run ops:redteam:readiness:check",
    "CI must execute ops:redteam:readiness:check",
  );

  requireText(
    failures,
    packageJson,
    '"ops:redteam:readiness:check": "node scripts/check-operational-redteam-drill-readiness.mjs"',
    "package scripts must expose ops:redteam:readiness:check",
  );
  requireText(
    failures,
    packageJson,
    '"test:ops-redteam-readiness": "node --test scripts/operational-redteam-drill-readiness.test.mjs"',
    "package scripts must expose test:ops-redteam-readiness",
  );
  requireText(
    failures,
    packageJson,
    "npm run ops:redteam:readiness:check",
    "release:check must include ops:redteam:readiness:check",
  );

  rejectText(
    failures,
    readiness,
    /Issue #110 (?:is )?closed|#110 closed|GO approved|production-ready|real-money ready/i,
    "readiness report must not claim #110 closure, GO, production readiness, or real-money readiness",
  );
  rejectText(
    failures,
    readiness,
    /raw customer data may be stored|secrets may be included/i,
    "readiness report must not allow raw customer data or secrets in evidence",
  );

  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const source = Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
    ),
  );
  const failures = evaluateOperationalRedteamReadiness(source);
  if (failures.length) {
    console.error("Operational Red Team drill readiness check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Operational Red Team drill readiness check passed.");
}
