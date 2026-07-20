import { readFile } from "node:fs/promises";

const files = {
  academyAuth: "src/app/api/academy-auth/route.ts",
  authority: "src/lib/security/session-authority.ts",
  legacyMigration: "src/lib/db-migrate-session-legacy-fallback.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  repair: "scripts/reconcile-session-revocations.ts",
  package: "package.json",
  legacyTest: "src/tests/security/auth-session-legacy-unbound-postgres.test.ts",
  docs: "docs/security/SESSION_AND_DEVICE_AUTHORITY.md",
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

requireText(
  "academyAuth",
  "getCanonicalSession(req, { strictRevocation: true })",
  "logout must prove strict revocation-aware identity before using the signed JTI",
);
requireText(
  "academyAuth",
  "signedUserId !== userId",
  "logout must bind cryptographic and canonical principals",
);
requireText(
  "academyAuth",
  "logoutSessionAuthority",
  "logout must delegate durable mutation and mandatory evidence",
);
rejectText(
  "academyAuth",
  "revokeSessionStrict",
  "logout cannot reintroduce route-side access revocation sequencing",
);
rejectText(
  "academyAuth",
  "revokeAllRefreshTokensForUser",
  "logout cannot reintroduce separate refresh revocation",
);

for (const invariant of [
  'FILENAME = "0036_session_legacy_unbound_fallback.sql"',
  "tecpey_revoke_legacy_unbound_session_refresh_authority",
  "NEW.refresh_family_id IS NULL",
  "UPDATE refresh_tokens",
  "UPDATE refresh_token_families",
  "legacy_unbound_session_revoked",
]) {
  requireText(
    "legacyMigration",
    invariant,
    `legacy unbound security-first invariant is missing: ${invariant}`,
  );
}
requireText(
  "migrationPlan",
  "runSessionLegacyFallbackMigrations",
  "canonical migration plan must execute the legacy fallback",
);
requireText(
  "legacyTest",
  "revokes every refresh token when an unbound legacy access session is revoked",
  "legacy security-first fallback requires PostgreSQL evidence",
);
requireText(
  "legacyTest",
  "activeRefresh, 0",
  "legacy test must prove no active refresh authority remains",
);

requireText(
  "authority",
  "session_revocation_outbox",
  "durable revocation must retain repairable Redis publication evidence",
);
requireText(
  "authority",
  "publishPendingSessionRevocations",
  "outbox must expose a retry authority",
);
requireText(
  "repair",
  "publishPendingSessionRevocations",
  "operations command must execute the canonical outbox publisher",
);
requireText(
  "repair",
  "process.exitCode = 2",
  "repair command must signal pending publication to supervision",
);
requireText(
  "package",
  '"auth:revocations:repair": "tsx scripts/reconcile-session-revocations.ts"',
  "repair authority must have a stable npm command",
);

for (const contract of [
  "Authoritative admission tuple",
  "Legacy unbound sessions",
  "Redis deny-cache outbox",
  "npm run auth:revocations:repair",
]) {
  requireText("docs", contract, `operations contract is missing: ${contract}`);
}

if (failures.length) {
  console.error("Session authority completion check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Session authority completion check passed: strict logout identity, legacy unbound refresh revocation, durable Redis repair command, PostgreSQL evidence and operations contract are permanent.",
);
