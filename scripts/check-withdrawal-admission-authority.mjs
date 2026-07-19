import { readFile } from "node:fs/promises";

const files = {
  package: "package.json",
  ci: ".github/workflows/ci.yml",
  env: "scripts/validate-env.mjs",
  route: "src/app/api/auth/withdraw/route.ts",
  authorizeRoute: "src/app/api/auth/withdraw/authorize/route.ts",
  genericTwoFactor: "src/app/api/auth/2fa/verify/route.ts",
  detailRoute: "src/app/api/auth/withdraw/[id]/route.ts",
  authority: "src/lib/security/withdrawal-admission-authority.ts",
  admission: "src/lib/security/withdrawal-admission-service.ts",
  legacyGate: "src/lib/security/withdraw-gate.ts",
  migration: "src/lib/db-migrate-withdrawal-admission.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  unitTests: "src/tests/security/withdrawal-admission.test.ts",
  postgresTests: "src/tests/security/withdrawal-admission-postgres.test.ts",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

requireText("package", '"withdrawals:check"', "withdrawal admission needs a governed npm command");
requireText("package", "npm run withdrawals:check", "release checks must include withdrawal admission authority");
requireText("package", '"test:withdrawal-admission"', "focused withdrawal tests need a governed command");
requireText("ci", "Withdrawal admission authority guard", "PR CI must run the withdrawal guard");
requireText("ci", "npm run withdrawals:check", "CI must invoke the governed withdrawal guard");
requireText("ci", "Withdrawal admission integration tests", "PR CI must expose focused withdrawal evidence");
requireText("ci", "TECPEY_WITHDRAWAL_PRICE_SECRET", "CI needs server-owned price signing authority");

requireText("route", "client_security_facts_forbidden", "browser amountUsd and 2FA booleans must be rejected");
requireText("route", 'req.headers.get("idempotency-key")', "withdrawal creation requires an Idempotency-Key header");
requireText("route", "authorizationId", "withdrawal creation requires a one-time authorization");
requireText("route", "createAuthoritativeWithdrawal", "the route must use the transactional admission service");
rejectText("route", "createWithdrawalRequest", "the route may not call the fail-open legacy service");
rejectText("route", "amountUsd,", "the route may not forward browser-owned USD valuation");
rejectText("route", "twoFaVerified,", "the route may not forward browser-owned 2FA evidence");
requireText("route", "strictRevocation: true", "withdrawal reads and writes need strict session authority");

requireText("authorizeRoute", "verifyTotpStep", "withdrawal authorization must retain the verified TOTP time step");
requireText("authorizeRoute", "canonicalizeWithdrawalCommand", "TOTP authorization must bind the canonical request");
requireText("authorizeRoute", "verification_step", "authorization evidence must store the TOTP step");
requireText("authorizeRoute", "totp_code_already_used", "one TOTP step may authorize only one withdrawal request");
requireText("authorizeRoute", "strictRevocation: true", "authorization requires a strict authenticated session");
requireText("authorizeRoute", "WITHDRAWAL_AUTHORIZATION_TTL_SECONDS", "authorization must expire quickly");
rejectText("genericTwoFactor", 'body.purpose === "withdrawal"', "withdrawal TOTP must have one dedicated authority route");
rejectText("genericTwoFactor", "issueWithdrawalAuthorization", "generic 2FA may not issue withdrawal evidence");

requireText("detailRoute", "cancelAuthoritativeWithdrawal", "cancellation must release reserved funds transactionally");
requireText("detailRoute", "strictRevocation: true", "withdrawal detail and cancellation require strict sessions");
rejectText("detailRoute", "cancelWithdrawal", "routes may not use cancellation that omits ledger release");

requireText("authority", "WITHDRAWAL_AUTHORIZATION_TTL_SECONDS = 5 * 60", "withdrawal authorization needs a short TTL");
requireText("authority", "withdrawalRequestHash", "withdrawal requests need a deterministic canonical hash");
requireText("authority", "Decimal#toFixed() without a precision", "canonical amount must preserve significant integer zeroes");
requireText("authority", "asset_network_mismatch", "asset/network combinations must be checked server-side");
requireText("authority", "destination_tag_required", "tag-based networks must enforce destination tags");
requireText("authority", "TECPEY_WITHDRAWAL_PRICE_SECRET", "server price evidence must be signed");
requireText("authority", "timingSafeEqual", "price signatures need constant-time verification");
requireText("authority", "WITHDRAWAL_PRICE_MAX_AGE_MS", "price evidence must be freshness bounded");
requireText("authority", "consumeWithdrawalAuthorizationTx", "authorization consumption must be transactional");
requireText("authority", "consumed_at IS NULL", "one-time authorization must reject replay");
requireText("authority", "risk_authority_unavailable", "risk authority outages must fail closed");
requireText("authority", "control_timeout", "compliance providers need bounded execution");
requireText("authority", "compliance_evidence_incomplete", "missing or malformed compliance evidence must never approve");
requireText("authority", "custody_launch_gate_disabled", "execution must remain behind the custody launch gate");

requireText("admission", "withTx", "admission must be transactionally atomic");
requireText("admission", "pg_advisory_xact_lock", "per-user admission and velocity must serialize");
requireText("admission", "idempotency_conflict", "same key with changed payload must be rejected");
requireText("admission", "request_hash", "idempotent replay must compare canonical payload evidence");
requireText("admission", "consumeWithdrawalAuthorizationTx", "2FA authorization must be consumed in the admission transaction");
requireText("admission", "INTERVAL '24 hours'", "velocity must derive from durable 24-hour withdrawals");
requireText("admission", "reserveForWithdrawalTx", "funds must be reserved in the admission transaction");
requireText("admission", "withdrawal_admission_outbox", "admission side effects need a durable outbox");
requireText("admission", "releaseWithdrawalTx", "cancellation must release ledger holds");
requireText("admission", "funds_reserved_at", "reservation evidence must be persisted");
rejectText("admission", "enqueueWithdrawal", "admission may not enqueue signing before custody authority");

requireText("legacyGate", "velocity_authority_unavailable", "legacy Redis velocity outages must block");
requireText("legacyGate", "Browser-provided verification booleans are never accepted", "legacy browser 2FA booleans must be inert");
requireText("legacyGate", "withdrawal_authorization_required", "legacy gate must direct callers to request-bound authority");
rejectText("legacyGate", "graceful degrade", "withdrawal security may not degrade open");

requireText("migration", "withdrawal_price_snapshots", "price evidence needs durable storage");
requireText("migration", "withdrawal_authorizations", "one-time authorization needs durable storage");
requireText("migration", "verification_step BIGINT NOT NULL", "TOTP step evidence must be mandatory");
requireText("migration", "UNIQUE (user_id, verification_step)", "TOTP replay must be prevented in PostgreSQL");
requireText("migration", "withdrawal_admission_outbox", "admission events need an outbox");
requireText("migration", "withdrawals_user_idempotency_unique_idx", "user idempotency needs a database uniqueness boundary");
requireText("migration", "price_snapshot_id", "withdrawals must retain price evidence linkage");
requireText("migration", "compliance_evidence", "withdrawals must retain compliance evidence");
requireText("migrationPlan", "runWithdrawalAdmissionMigrations", "the migration must be in the canonical plan");

requireText("env", "TECPEY_WITHDRAWAL_PRICE_SECRET", "production must require price-signing authority");
requireText("env", "TECPEY_REAL_WITHDRAWALS_ENABLED=1 is forbidden", "real execution must remain disabled until custody closure");
requireText("env", "TECPEY_WITHDRAWAL_DAILY_LIMIT_USD", "velocity configuration must be validated");

requireText("unitTests", "preserves significant integer zeroes", "canonical amount regression needs a test");
requireText("unitTests", "provider outage never approves", "provider failures need fail-closed tests");
requireText("unitTests", "sanctions match blocks", "sanctions denial needs a test");
requireText("unitTests", "browser security facts", "route must reject forged browser facts");
requireText("postgresTests", "idempotent response-loss replay", "database tests must prove replay safety");
requireText("postgresTests", "changed payload conflicts", "database tests must reject idempotency mutation");
requireText("postgresTests", "authorization cannot be replayed", "one-time authorization needs a database test");
requireText("postgresTests", "insufficient balance rolls back", "reservation failure must roll back admission");
requireText("postgresTests", "cancellation releases the hold", "ledger release needs an integration test");

if (failures.length) {
  console.error("Withdrawal admission authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Withdrawal admission authority check passed: browser facts are rejected; a single request-bound and replay-proof TOTP route, signed fresh pricing, strict risk, fail-closed compliance, PostgreSQL velocity/idempotency, atomic reservation, durable outbox and custody launch blocking are enforced.");
