import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import {
  authenticateOrRegisterAcademyAccount,
  fingerprintAcademyAccount,
  fingerprintAcademyUsername,
  type AcademyAccountAuditContext,
} from "../../lib/security/academy-account-authority";
import {
  hashSensitiveAuditRequest,
  writeSensitiveMutationAuditTx,
} from "../../lib/security/sensitive-mutation-audit";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);
const accountIds = new Set<string>();

function identity(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function username(): string {
  return `academy${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function audit(input: {
  tenantId: string;
  accountId: string;
  username: string;
  correlationId?: string;
}): AcademyAccountAuditContext {
  const accountFingerprint = fingerprintAcademyAccount(input.accountId);
  const usernameFingerprint = fingerprintAcademyUsername(input.username);
  return {
    tenantId: input.tenantId,
    actorType: "user",
    actorId: input.accountId,
    correlationId:
      input.correlationId ?? `academy-account-create-${randomUUID()}`,
    requestHash: hashSensitiveAuditRequest({
      tenantId: input.tenantId,
      action: "credential.account.create",
      mode: "signup",
      accountFingerprint,
      usernameFingerprint,
    }),
  };
}

async function loadAccount(accountId: string) {
  const result = await withDb(async (client) => {
    const account = await client.query<{
      id: string;
      email: string;
      username: string;
      display_name: string;
      password_hash: string;
    }>(
      `SELECT id, email, username, display_name, password_hash
         FROM academy_auth_accounts
        WHERE id = $1`,
      [accountId],
    );
    const evidence = await client.query<{
      action: string;
      outcome: string;
      document: string;
    }>(
      `SELECT action, outcome, row_to_json(event)::text AS document
         FROM sensitive_mutation_audit_events event
        WHERE action = 'credential.account.create'
          AND actor_id = $1
        ORDER BY created_at`,
      [accountId],
    );
    return { account: account.rows[0] ?? null, evidence: evidence.rows };
  });
  assert.equal(result.enabled, true);
  if (!result.enabled) throw new Error("academy_account_test_database_unavailable");
  return result.value;
}

after(async () => {
  if (accountIds.size === 0) return;
  await withDb(async (client) => {
    await client.query("DELETE FROM academy_auth_accounts WHERE id = ANY($1::text[])", [
      [...accountIds],
    ]);
    return true;
  });
});

describe("Academy account credential authority", () => {
  it(
    "commits account creation with one secret-free mandatory event",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const accountId = identity("academy-account");
      const tenantId = identity("academy-account-tenant");
      const email = `${randomUUID()}@example.com`;
      const userName = username();
      const displayName = `Display ${randomUUID()}`;
      const password = `A!${randomUUID()}-secure`;
      accountIds.add(accountId);

      const result = await authenticateOrRegisterAcademyAccount({
        mode: "signup",
        accountId,
        email,
        username: userName,
        displayName,
        password,
        audit: audit({ tenantId, accountId, username: userName }),
      });
      assert.equal(result.status, "created");

      const state = await loadAccount(accountId);
      assert.equal(state.account?.email, email);
      assert.equal(state.account?.username, userName);
      assert.equal(state.account?.display_name, displayName);
      assert.notEqual(state.account?.password_hash, password);
      assert.equal(state.evidence.length, 1);
      assert.equal(state.evidence[0]?.outcome, "success");
      const document = state.evidence[0]?.document ?? "";
      for (const forbidden of [email, password, displayName, userName]) {
        assert.equal(document.includes(forbidden), false);
      }
      assert.match(document, /accountFingerprint/);
      assert.match(document, /usernameFingerprint/);
    },
  );

  it(
    "rolls back account insertion when mandatory evidence conflicts",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const accountId = identity("academy-account-conflict");
      const tenantId = identity("academy-account-tenant");
      const email = `${randomUUID()}@example.com`;
      const userName = username();
      const correlationId = `academy-account-conflict-${randomUUID()}`;
      accountIds.add(accountId);

      const seeded = await withDb(async (client) => {
        await writeSensitiveMutationAuditTx(client, {
          tenantId,
          actorType: "user",
          actorId: accountId,
          action: "credential.account.create",
          resourceType: "credential_account",
          resourceId: accountId,
          outcome: "success",
          correlationId,
          requestHash: "f".repeat(64),
          metadata: { policyVersion: "forced-conflict" },
        });
        return true;
      });
      assert.equal(seeded.enabled, true);

      await assert.rejects(
        authenticateOrRegisterAcademyAccount({
          mode: "signup",
          accountId,
          email,
          username: userName,
          displayName: "Rollback Account",
          password: `A!${randomUUID()}-secure`,
          audit: audit({
            tenantId,
            accountId,
            username: userName,
            correlationId,
          }),
        }),
        /sensitive_audit_correlation_conflict/,
      );
      const state = await loadAccount(accountId);
      assert.equal(state.account, null);
      assert.equal(state.evidence.length, 1);
    },
  );

  it(
    "authenticates an existing account without mutating stored profile or evidence",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const accountId = identity("academy-account-login");
      const tenantId = identity("academy-account-tenant");
      const email = `${randomUUID()}@example.com`;
      const storedUsername = username();
      const storedDisplayName = "Stored Academy Name";
      const password = `A!${randomUUID()}-secure`;
      accountIds.add(accountId);

      const created = await authenticateOrRegisterAcademyAccount({
        mode: "signup",
        accountId,
        email,
        username: storedUsername,
        displayName: storedDisplayName,
        password,
        audit: audit({ tenantId, accountId, username: storedUsername }),
      });
      assert.equal(created.status, "created");

      const authenticated = await authenticateOrRegisterAcademyAccount({
        mode: "login",
        accountId,
        email,
        username: username(),
        displayName: "Request Must Not Mutate",
        password,
        audit: audit({ tenantId, accountId, username: storedUsername }),
      });
      assert.equal(authenticated.status, "authenticated");
      if (authenticated.status !== "authenticated") {
        throw new Error("academy_account_login_failed");
      }
      assert.equal(authenticated.account.username, storedUsername);
      assert.equal(authenticated.account.displayName, storedDisplayName);

      const state = await loadAccount(accountId);
      assert.equal(state.account?.username, storedUsername);
      assert.equal(state.account?.display_name, storedDisplayName);
      assert.equal(state.evidence.length, 1);
    },
  );

  it(
    "rejects an invalid password without mutation or new evidence",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const accountId = identity("academy-account-password");
      const tenantId = identity("academy-account-tenant");
      const email = `${randomUUID()}@example.com`;
      const userName = username();
      accountIds.add(accountId);

      await authenticateOrRegisterAcademyAccount({
        mode: "signup",
        accountId,
        email,
        username: userName,
        displayName: "Password Account",
        password: `A!${randomUUID()}-secure`,
        audit: audit({ tenantId, accountId, username: userName }),
      });
      const rejected = await authenticateOrRegisterAcademyAccount({
        mode: "login",
        accountId,
        email,
        username: username(),
        displayName: "Ignored",
        password: "definitely-wrong-password",
        audit: audit({ tenantId, accountId, username: userName }),
      });
      assert.deepEqual(rejected, { status: "invalid_credentials" });
      const state = await loadAccount(accountId);
      assert.equal(state.account?.display_name, "Password Account");
      assert.equal(state.evidence.length, 1);
    },
  );

  it(
    "serializes concurrent signup ownership for one username",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const sharedUsername = username();
      const tenantId = identity("academy-account-tenant");
      const firstId = identity("academy-account-race-a");
      const secondId = identity("academy-account-race-b");
      accountIds.add(firstId);
      accountIds.add(secondId);

      const [first, second] = await Promise.all([
        authenticateOrRegisterAcademyAccount({
          mode: "signup",
          accountId: firstId,
          email: `${randomUUID()}@example.com`,
          username: sharedUsername,
          displayName: "Race A",
          password: `A!${randomUUID()}-secure`,
          audit: audit({ tenantId, accountId: firstId, username: sharedUsername }),
        }),
        authenticateOrRegisterAcademyAccount({
          mode: "signup",
          accountId: secondId,
          email: `${randomUUID()}@example.com`,
          username: sharedUsername,
          displayName: "Race B",
          password: `A!${randomUUID()}-secure`,
          audit: audit({ tenantId, accountId: secondId, username: sharedUsername }),
        }),
      ]);
      assert.equal(
        [first.status, second.status].filter((status) => status === "created").length,
        1,
      );
      assert.equal(
        [first.status, second.status].filter((status) => status === "username_taken").length,
        1,
      );
    },
  );
});
