import { readFile } from "node:fs/promises";

const files = {
  inventory: "docs/security/RISK_EVENT_ENFORCEMENT_EVIDENCE_INVENTORY.md",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  migration: "src/lib/db-migrate-risk-enforcement-authority.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  evidence: "src/lib/security/risk-enforcement-evidence.ts",
  authority: "src/lib/security/risk-enforcement-authority.ts",
  detector: "src/lib/security/risk-engine.ts",
  enforcement: "src/lib/security/risk-enforcement.ts",
  orders: "src/app/api/orders/route.ts",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [
      key,
      await readFile(path, "utf8"),
    ]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!source[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (source[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

for (const action of [
  "risk.event.record",
  "risk.enforcement.apply",
  "risk.enforcement.clear",
  "risk.enforcement.expire",
]) {
  requireText("audit", action, `missing typed action ${action}`);
  requireText("evidence", action, `evidence builder cannot emit ${action}`);
}
for (const resource of ["risk_event", "risk_enforcement"]) {
  requireText("audit", resource, `missing typed resource ${resource}`);
  requireText("evidence", resource, `evidence builder cannot emit ${resource}`);
}

for (const invariant of [
  'FILENAME = "0045_risk_enforcement_authority.sql"',
  "risk_authority_events",
  "risk_effective_enforcements",
  "risk_enforcement_outbox",
  "risk authority event rows are append-preserved",
  "risk effective enforcement generation must increment exactly once",
  "risk enforcement outbox rows are append-preserved",
  "tecpey_sensitive_audit_has_forbidden_key(detector_facts)",
]) {
  requireText("migration", invariant, `missing schema invariant ${invariant}`);
}
requireText(
  "migrationPlan",
  "runRiskEnforcementAuthorityMigrations",
  "canonical migration plan must execute migration 0045",
);

for (const invariant of [
  "pg_advisory_xact_lock",
  "writeEventEvidence",
  'action: "risk.enforcement.apply"',
  'action: "risk.enforcement.expire"',
  "risk_enforcement_outbox",
  "publishRiskEnforcementOutbox",
  "resolveRiskEnforcement",
]) {
  requireText("authority", invariant, `missing canonical authority invariant ${invariant}`);
}
requireText(
  "authority",
  'if (!transaction.enabled) throw new Error("risk_authority_unavailable")',
  "decision commit must fail closed when PostgreSQL is unavailable",
);
requireText(
  "authority",
  "return { available: false }",
  "gate resolution must expose unavailable durable authority",
);

rejectText(
  "detector",
  "writeAudit(",
  "legacy fire-and-forget risk audit is forbidden",
);
rejectText(
  "detector",
  "setRiskLevel",
  "detector cannot mutate Redis-only effective state",
);
rejectText(
  "detector",
  "void emit",
  "detected decisions cannot be fire-and-forget",
);
requireText(
  "detector",
  "for (const decision of decisions) {",
  "detected decisions must be processed sequentially before success",
);
requireText(
  "detector",
  "const result = await commitDecision(decision);",
  "each detected decision must durably commit before the check succeeds",
);
requireText(
  "detector",
  "blocked = blocked || blocksTrading(result);",
  "a newly committed block must be surfaced to the current admission",
);
requireText(
  "detector",
  "fingerprintRiskDetectorValue(opts.ip)",
  "raw IP must not enter durable detector evidence",
);
requireText(
  "detector",
  "detectorIdentity: `duplicate:${orderFingerprint}:${burstBucket}`",
  "duplicate detector identity must remain bounded to its five-second window",
);
requireText(
  "enforcement",
  "resolveRiskEnforcement",
  "financial gate must resolve PostgreSQL authority",
);
rejectText(
  "enforcement",
  "globalThis.tecpeyRedisClient",
  "financial gate cannot read Redis as effective authority",
);
requireText(
  "enforcement",
  'return "risk_authority_unavailable"',
  "unresolved durable authority must not silently allow",
);

requireText(
  "orders",
  "const riskCheck = await checkOrderRisk",
  "order route must await detected durable decisions",
);
requireText(
  "orders",
  'tradeBlock === "risk_authority_unavailable"',
  "order route must return a truthful retryable authority error",
);
requireText(
  "orders",
  "if (!riskCheck.ok) return apiError(riskCheck.reason, 503)",
  "order admission must stop when a detected decision cannot commit",
);
requireText(
  "orders",
  'if (riskCheck.blocked) return apiError("account_trade_restricted", 403)',
  "an enforcement committed by this detector run must stop the same order admission",
);

for (const contract of [
  "PostgreSQL owns",
  "Redis hit is accepted only",
  "legacy/unreachable authority candidate",
  "does not redesign fraud scoring",
]) {
  requireText("inventory", contract, `inventory contract missing: ${contract}`);
}

if (failures.length) {
  console.error("Risk enforcement authority guard failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Risk enforcement authority guard passed: PostgreSQL owns durable decisions, effective restrictions, mandatory evidence and repairable Redis projection debt.",
);
