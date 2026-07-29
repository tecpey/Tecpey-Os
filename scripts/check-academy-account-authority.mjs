import { readFile } from "node:fs/promises";

const files = {
  route: "src/app/api/academy-auth/route.ts",
  authority: "src/lib/security/academy-account-authority.ts",
  audit: "src/lib/security/sensitive-mutation-audit.ts",
  tests: "src/tests/security/auth-academy-account-authority-postgres.test.ts",
  inventory: "docs/security/ACADEMY_ACCOUNT_CREDENTIAL_EVIDENCE_INVENTORY.md",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!source[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (source[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

requireText(
  "route",
  "authenticateOrRegisterAcademyAccount({",
  "production account authentication/registration must delegate to the canonical authority",
);
requireText(
  "route",
  "fingerprintAcademyAccount(accountId)",
  "route evidence request must use a bounded account fingerprint",
);
requireText(
  "route",
  "fingerprintAcademyUsername(username)",
  "route evidence request must use a bounded username fingerprint",
);
requireText(
  "route",
  'process.env.NODE_ENV === "production"',
  "local JSON fallback must remain disabled in production",
);
requireText(
  "route",
  "storePreAuthToken(preAuthToken, account.accountId)",
  "2FA login must store a server-owned pre-auth challenge",
);
requireText(
  "route",
  "peekPreAuthToken(preAuthToken)",
  "route must prove the pre-auth challenge was durably stored before returning it",
);
requireText(
  "route",
  "admitSessionAuthority({",
  "session issuance must remain delegated to the canonical session authority",
);
requireText(
  "route",
  "logoutSessionAuthority({",
  "logout must remain delegated to the canonical session authority",
);
for (const forbidden of [
  "INSERT INTO academy_auth_accounts",
  "UPDATE academy_auth_accounts",
  "password_hash\n",
  "pbkdf2Sync",
  "timingSafeEqual",
  "writeAudit(",
  "body.accountId",
  "body.actorId",
  "body.tenantId",
]) {
  rejectText("route", forbidden, `route reintroduced forbidden credential authority: ${forbidden}`);
}

requireText(
  "authority",
  'import { withTx } from "@/lib/db"',
  "credential account authority must use the canonical PostgreSQL transaction wrapper",
);
requireText(
  "authority",
  "pg_advisory_xact_lock",
  "email and username ownership must be serialized",
);
requireText(
  "authority",
  "authenticateOrRegisterAcademyAccount",
  "canonical Academy credential authority is missing",
);
requireText(
  "authority",
  'if (input.mode === "login")',
  "login must have an explicit read/authenticate-only path",
);
requireText(
  "authority",
  "WHERE email = $1\n          FOR UPDATE",
  "login must resolve the stored account by email only",
);
requireText(
  "authority",
  "INSERT INTO academy_auth_accounts",
  "signup must persist the credential account in the authority transaction",
);
requireText(
  "authority",
  'action: "credential.account.create"',
  "signup must append typed mandatory evidence",
);
requireText(
  "authority",
  "writeSensitiveMutationAuditTx(client",
  "account state and mandatory evidence must share one transaction",
);
requireText(
  "authority",
  "tecpey-academy-account-v1\\0",
  "account fingerprint must be domain separated",
);
requireText(
  "authority",
  "tecpey-academy-username-v1\\0",
  "username fingerprint must be domain separated",
);
rejectText(
  "authority",
  "writeAudit(",
  "legacy best-effort audit cannot satisfy account creation evidence",
);
rejectText(
  "authority",
  "UPDATE academy_auth_accounts",
  "login must not mutate Academy profile state",
);

requireText(
  "audit",
  "credential.account.create",
  "central sensitive audit action union is missing account creation",
);
requireText(
  "audit",
  "credential_account",
  "central sensitive audit resource union is missing credential account",
);

for (const proof of [
  "commits account creation with one secret-free mandatory event",
  "rolls back account insertion when mandatory evidence conflicts",
  "authenticates an existing account without mutating stored profile or evidence",
  "rejects an invalid password without mutation or new evidence",
  "serializes concurrent signup ownership for one username",
]) {
  requireText("tests", proof, `missing PostgreSQL adversarial proof: ${proof}`);
}

for (const contract of [
  "signup account/password state commits without mandatory mutation evidence",
  "login mutates display name from request input",
  "Local JSON storage stays explicitly disabled in production",
]) {
  requireText("inventory", contract, `inventory contract missing: ${contract}`);
}

if (failures.length) {
  console.error("Academy account authority guard failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Academy account authority guard passed: production credential creation is transaction-coupled to mandatory evidence, login is read-only and session/pre-auth boundaries remain canonical.",
);
