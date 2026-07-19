import { readFile } from "node:fs/promises";

const files = {
  package: "package.json",
  ci: ".github/workflows/ci.yml",
  env: "scripts/validate-env.mjs",
  route: "src/app/api/auth/withdraw/route.ts",
  authorizeRoute: "src/app/api/auth/withdraw/authorize/route.ts",
  genericTwoFactor: "src/app/api/auth/2fa/verify/route.ts",
  detailRoute: "src/app/api/auth/withdraw/[id]/route.ts",
  totp: "src/lib/security/totp.ts",
  barrel: "src/lib/security/withdrawal-admission-authority.ts",
  command: "src/lib/security/withdrawal-command-authority.ts",
  price: "src/lib/security/withdrawal-price-authority.ts",
  authorization: "src/lib/security/withdrawal-authorization-authority.ts",
  compliance: "src/lib/security/withdrawal-compliance-authority.ts",
  replay: "src/lib/security/withdrawal-replay-authority.ts",
  admission: "src/lib/security/withdrawal-admission-service.ts",
  legacyGate: "src/lib/security/withdraw-gate.ts",
  migration: "src/lib/db-migrate-withdrawal-admission.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  unitTests: "src/tests/security/withdrawal-admission.test.ts",
  postgresTests: "src/tests/security/withdrawal-admission-postgres.test.ts",
  replayTests: "src/tests/security/withdrawal-admission-replay-postgres.test.ts",
  reservationTests:
    "src/tests/security/withdrawal-admission-reservation-metadata-postgres.test.ts",
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
requireText("package", '"test:withdrawal-admission"', "focused withdrawal tests need a governed command");
requireText("package", "npm run withdrawals:check", "release checks must include withdrawal authority");
requireText("package", "npm run test:withdrawal-admission", "release checks must include focused withdrawal tests");
requireText("ci", "Withdrawal admission authority guard", "PR CI must run the withdrawal guard");
requireText("ci", "npm run withdrawals:check", "CI must invoke the governed withdrawal guard");
requireText("ci", "Withdrawal admission integration tests", "PR CI must run focused withdrawal tests");
requireText("ci", "TECPEY_WITHDRAWAL_PRICE_SECRET", "CI needs server-owned price signing authority");

requireText("route", "client_security_facts_forbidden", "browser amountUsd and 2FA booleans must be rejected");
requireText("route", 'req.headers.get("idempotency-key")', "creation requires an Idempotency-Key header");
requireText("route", "canonicalizeWithdrawalCommand", "route replay and admission must share one canonical command");
requireText("route", "resolveWithdrawalReplay", "committed replay must be resolved before external authorities");
requireText("route", "authorizationId", "new creation requires one-time authorization evidence");
requireText("route", "createAuthoritativeWithdrawal", "new creation must use the transactional service");
requireText("route", "listUserWithdrawalsStrict", "history reads must expose storage failure");
requireText("route", "strictRevocation: true", "withdrawal reads and writes require strict sessions");
rejectText("route", "createWithdrawalRequest", "routes may not call the fail-open legacy service");
rejectText("route", "amountUsd: body", "routes may not forward browser-owned valuation");
rejectText("route", "twoFaVerified: body", "routes may not forward browser-owned 2FA evidence");

requireText("authorizeRoute", "verifyCsrfOrigin", "authorization is a protected mutation");
requireText("authorizeRoute", "strictRevocation: true", "authorization requires strict session authority");
requireText("authorizeRoute", "canonicalizeWithdrawalCommand", "authorization must bind the canonical command");
requireText("authorizeRoute", "verifyTotpStep", "authorization must retain the accepted TOTP step");
requireText("authorizeRoute", "issueWithdrawalAuthorizationTx", "authorization issuance must be transactional");
requireText("authorizeRoute", "totp_code_already_used", "one TOTP step may issue only one authorization");
requireText("authorizeRoute", "requestHash", "authorization must bind a request hash");
rejectText("genericTwoFactor", 'body.purpose === "withdrawal"', "withdrawal TOTP must remain on one dedicated route");
rejectText("genericTwoFactor", "issueWithdrawalAuthorization", "generic 2FA may not issue withdrawal evidence");

requireText("detailRoute", "cancelAuthoritativeWithdrawal", "cancellation must release funds transactionally");
requireText("detailRoute", "fetchWithdrawal(id, userId)", "detail reads must be owner-bound");
requireText("detailRoute", "strictRevocation: true", "detail and cancellation require strict sessions");
rejectText("detailRoute", "cancelWithdrawal", "routes may not use cancellation without ledger release");

requireText("totp", "verifyTotpStep", "TOTP verification must expose a replay-prevention step");
requireText("totp", "timingSafeEqual", "TOTP comparison must remain constant-time");
requireText("barrel", 'export * from "./withdrawal-command-authority"', "authority surface must be modular");
requireText("barrel", 'export * from "./withdrawal-price-authority"', "price authority must be isolated");
requireText("barrel", 'export * from "./withdrawal-authorization-authority"', "authorization authority must be isolated");
requireText("barrel", 'export * from "./withdrawal-compliance-authority"', "compliance authority must be isolated");

requireText("command", "withdrawalRequestHash", "withdrawal commands need a deterministic canonical hash");
requireText("command", "amount = parsed.toFixed()", "canonical amounts must preserve significant integer zeroes");
rejectText("command", 'replace(/\\.?0+$/', "canonicalization may not strip significant integer zeroes");
requireText("command", "asset_network_mismatch", "asset/network combinations must be checked server-side");
requireText("command", "destination_tag_required", "tag-based networks must enforce destination tags");

requireText("price", "TECPEY_WITHDRAWAL_PRICE_SECRET", "server price evidence must be signed");
requireText("price", "timingSafeEqual", "price signatures need constant-time verification");
requireText("price", "WITHDRAWAL_PRICE_MAX_AGE_MS", "price evidence must be freshness bounded");
requireText("price", "expires_at > NOW()", "expired price evidence must be rejected in SQL");
requireText("price", "price_snapshot_signature_invalid", "tampered price evidence must fail closed");

requireText("authorization", "verificationStep", "authorization issuance must bind a TOTP step");
requireText("authorization", "consumeWithdrawalAuthorizationTx", "authorization consumption must be transactional");
requireText("authorization", "consumed_at IS NULL", "authorization replay must be rejected");
requireText("authorization", "expires_at > NOW()", "expired authorization must be rejected");

requireText("compliance", "risk_authority_unavailable", "risk outages must fail closed");
requireText("compliance", "control_timeout", "provider calls need bounded execution");
requireText("compliance", "compliance_evidence_incomplete", "missing/malformed evidence must never approve");
requireText("compliance", "custody_launch_gate_disabled", "execution must remain behind custody closure");

requireText("replay", "resolveWithdrawalReplay", "committed replay needs an explicit authority");
requireText("replay", "user_id = $1", "replay lookup must be owner-bound");
requireText("replay", "idempotency_key = $2", "replay lookup must bind the idempotency key");
requireText("replay", "request_hash", "replay must compare the immutable request hash");
requireText("replay", "fetchWithdrawal", "replay must return persisted withdrawal evidence");
rejectText("replay", "getComplianceProviders", "committed replay may not depend on compliance providers");
rejectText("replay", "getAuthoritativeUsdValuation", "committed replay may not depend on current pricing");
rejectText("replay", "tecpeyRedisClient", "committed replay may not depend on Redis risk state");

requireText("admission", "withTx", "admission must be transactionally atomic");
requireText("admission", "pg_advisory_xact_lock", "per-user admission and velocity must serialize");
requireText("admission", "idempotency_conflict", "changed payload reuse must fail closed");
requireText("admission", "request_hash", "concurrent replay must compare canonical payload evidence");
requireText("admission", "consumeWithdrawalAuthorizationTx", "authorization must be consumed in the admission transaction");
requireText("admission", "INTERVAL '24 hours'", "velocity must derive from durable withdrawals");
requireText("admission", "reserveExactWithdrawalTx", "funds must be reserved with exact decimals");
requireText("admission", "releaseExactWithdrawalTx", "cancellation must release exact ledger holds");
requireText("admission", "withdrawal_admission_outbox", "admission side effects need a durable outbox");
requireText("admission", "funds_reserved_at", "reservation evidence must be persisted");
rejectText("admission", "reserveForWithdrawalTx", "legacy number-typed reservation is forbidden");
rejectText("admission", "releaseWithdrawalTx", "legacy number-typed release is forbidden");
rejectText("admission", "as unknown as number", "financial authority may not cast decimal strings to numbers");
rejectText("admission", "enqueueWithdrawal", "admission may not enqueue signing before custody closure");

requireText("legacyGate", "velocity_authority_unavailable", "legacy Redis velocity outages must block");
requireText("legacyGate", "Browser-provided verification booleans are never accepted", "legacy browser 2FA booleans must be inert");
requireText("legacyGate", "withdrawal_authorization_required", "legacy callers must move to request-bound authority");
rejectText("legacyGate", "graceful degrade", "withdrawal security may not degrade open");

requireText("migration", "NUMERIC(38, 18)", "wallet reservation precision must support exact asset decimals");
requireText("migration", "withdrawal_price_snapshots", "price evidence needs durable storage");
requireText("migration", "withdrawal_authorizations", "one-time authorization needs durable storage");
requireText("migration", "verification_step BIGINT NOT NULL", "TOTP step replay prevention needs DB authority");
requireText("migration", "UNIQUE (user_id, verification_step)", "one TOTP window may issue only one authorization");
requireText("migration", "withdrawal_admission_outbox", "admission events need an outbox");
requireText("migration", "withdrawals_user_idempotency_unique_idx", "user idempotency needs DB uniqueness");
requireText("migration", "price_snapshot_id", "withdrawals must retain price evidence linkage");
requireText("migration", "compliance_evidence", "withdrawals must retain compliance evidence");
requireText("migration", "tecpey_clear_terminal_withdrawal_reservation", "terminal states need a database-owned metadata cleanup function");
requireText("migration", "withdrawals_clear_terminal_reservation", "terminal reservation cleanup must run as a trigger");
requireText("migration", "withdrawals_terminal_reservation_cleared", "database constraints must reject stale terminal reservation metadata");
requireText("migrationPlan", "runWithdrawalAdmissionMigrations", "migration must be in the canonical plan");

requireText("env", "TECPEY_WITHDRAWAL_PRICE_SECRET", "production must require price-signing authority");
requireText("env", "TECPEY_REAL_WITHDRAWALS_ENABLED=1 is forbidden", "real execution must remain disabled until custody closure");
requireText("env", "TECPEY_WITHDRAWAL_DAILY_LIMIT_USD", "velocity configuration must be validated");

requireText("unitTests", "preserves significant integer zeroes", "canonical amount regression needs a test");
requireText("unitTests", "provider outage never approves", "provider failures need fail-closed tests");
requireText("unitTests", "sanctions match blocks", "sanctions denial needs a test");
requireText("unitTests", "browser security facts", "route must reject forged browser facts");
requireText("postgresTests", "idempotent response-loss replay", "database tests must prove replay safety");
requireText("postgresTests", "changed payload conflicts", "database tests must reject idempotency mutation");
requireText("postgresTests", "authorization cannot be replayed", "one-time authorization needs a DB test");
requireText("postgresTests", "insufficient balance rolls back", "reservation failure must roll back admission");
requireText("postgresTests", "concurrent requests cannot reserve more", "concurrency must not overspend balance");
requireText("postgresTests", "stale price evidence cannot authorize valuation", "stale pricing needs a negative test");
requireText("postgresTests", "cancellation releases the hold", "ledger release needs an integration test");
requireText("postgresTests", "type = 'hold'", "tests must inspect the real ledger hold type");
requireText("postgresTests", "type = 'release'", "tests must inspect the real ledger release type");
requireText("replayTests", "resolves exact replay from PostgreSQL without external providers", "committed replay needs a provider-independent DB test");
requireText("replayTests", "checks committed replay before authorization", "route ordering must be regression tested");
requireText("reservationTests", "clears funds_reserved_at in PostgreSQL", "terminal states must prove reservation metadata is cleared");
requireText("reservationTests", 'for (const terminalState of ["rejected", "blocked", "cancelled"]', "every terminal release state needs metadata coverage");

if (failures.length) {
  console.error("Withdrawal admission authority check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Withdrawal admission authority check passed: browser facts are rejected; committed replay is provider-independent; canonical commands, one-time TOTP, signed fresh pricing, strict risk, fail-closed compliance, PostgreSQL velocity/idempotency, exact atomic reservation, terminal metadata cleanup, durable outbox and custody launch blocking are enforced.");
