import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  commitVerifiedWebAuthnCounterTransition,
  registerVerifiedWebAuthnCredential,
  renameWebAuthnCredential,
  revokeWebAuthnCredential,
  type WebAuthnAuditContext,
  type WebAuthnAuthenticationAuditContext,
} from "../../lib/security/webauthn-credential-authority";
import { hashSensitiveAuditRequest } from "../../lib/security/sensitive-mutation-audit";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;
const userIds = new Set<string>();

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function tenantId(): string {
  return `webauthn-test-${randomUUID()}`;
}

function credentialId(): string {
  return Buffer.from(`credential-${randomUUID()}`).toString("base64url");
}

function mutationAudit(input: {
  tenant: string;
  userId: string;
  action: string;
  correlationId?: string;
  evidence?: Record<string, unknown>;
  actorId?: string;
}): WebAuthnAuditContext {
  const actorId = input.actorId ?? input.userId;
  return {
    tenantId: input.tenant,
    actorType: "user",
    actorId,
    correlationId: input.correlationId ?? `webauthn-mutation-${randomUUID()}`,
    requestHash: hashSensitiveAuditRequest({
      tenantId: input.tenant,
      actorId,
      userId: input.userId,
      action: input.action,
      ...input.evidence,
    }),
  };
}

function authenticationAudit(input: {
  tenant: string;
  correlationId?: string;
  evidence?: Record<string, unknown>;
}): WebAuthnAuthenticationAuditContext {
  return {
    tenantId: input.tenant,
    correlationId: input.correlationId ?? `webauthn-auth-${randomUUID()}`,
    requestHash: hashSensitiveAuditRequest({
      tenantId: input.tenant,
      action: "credential.webauthn.authenticate",
      ...input.evidence,
    }),
  };
}

async function registerCredential(input: {
  tenant: string;
  userId: string;
  credentialId?: string;
  counter?: number;
  correlationId?: string;
  publicKey?: string;
}) {
  userIds.add(input.userId);
  const id = input.credentialId ?? credentialId();
  const result = await registerVerifiedWebAuthnCredential({
    userId: input.userId,
    credentialId: id,
    publicKey: input.publicKey ?? Buffer.from(`public-key-${randomUUID()}`).toString("base64url"),
    counter: input.counter ?? 0,
    deviceName: "Primary passkey",
    aaguid: "0".repeat(32),
    transports: ["internal"],
    backupEligible: true,
    backupState: true,
    audit: mutationAudit({
      tenant: input.tenant,
      userId: input.userId,
      action: "credential.webauthn.register",
      correlationId: input.correlationId,
      evidence: { credentialId: id, counter: input.counter ?? 0 },
    }),
  });
  assert.equal(result.ok, true);
  return id;
}

async function readCredential(id: string): Promise<{
  user_id: string;
  counter: number;
  device_name: string;
  is_active: boolean;
} | null> {
  return withClient(async (client) => {
    const result = await client.query<{
      user_id: string;
      counter: number;
      device_name: string;
      is_active: boolean;
    }>(
      `SELECT user_id, counter, device_name, is_active
         FROM webauthn_credentials
        WHERE credential_id = $1
        LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  });
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 8,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  if (pool && userIds.size > 0) {
    await withClient(async (client) => {
      await client.query(
        `DELETE FROM webauthn_credentials
          WHERE user_id = ANY($1::text[])`,
        [[...userIds]],
      );
    });
  }
  await pool?.end();
  pool = null;
});

describe("WebAuthn transactional credential evidence", { concurrency: 1 }, () => {
  it(
    "commits registration and secret-free evidence atomically",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const tenant = tenantId();
      const userId = `webauthn-user-${randomUUID()}`;
      const id = credentialId();
      const publicKey = Buffer.from(`sensitive-public-key-${randomUUID()}`).toString("base64url");
      await registerCredential({ tenant, userId, credentialId: id, publicKey });

      const stored = await readCredential(id);
      assert.ok(stored);
      assert.equal(stored.user_id, userId);

      await withClient(async (client) => {
        const evidence = await client.query<{ document: string; metadata: Record<string, unknown> }>(
          `SELECT row_to_json(event)::text AS document, metadata
             FROM sensitive_mutation_audit_events event
            WHERE tenant_id = $1
              AND actor_id = $2
              AND action = 'credential.webauthn.register'
              AND outcome = 'success'
            LIMIT 1`,
          [tenant, userId],
        );
        assert.equal(evidence.rowCount, 1);
        const document = evidence.rows[0]!.document;
        assert.equal(document.includes(id), false);
        assert.equal(document.includes(publicKey), false);
        assert.equal(document.includes("attestationObject"), false);
        assert.equal(document.includes("clientDataJSON"), false);
        assert.equal(typeof evidence.rows[0]!.metadata.credentialFingerprint, "string");
      });
    },
  );

  it(
    "rolls back registration when mandatory audit admission fails",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const userId = `webauthn-user-${randomUUID()}`;
      const id = credentialId();
      userIds.add(userId);

      await assert.rejects(
        registerVerifiedWebAuthnCredential({
          userId,
          credentialId: id,
          publicKey: "public-key",
          counter: 0,
          deviceName: "Rollback passkey",
          aaguid: null,
          transports: [],
          backupEligible: false,
          backupState: false,
          audit: mutationAudit({
            tenant: "INVALID TENANT",
            userId,
            action: "credential.webauthn.register",
          }),
        }),
        /invalid_sensitive_audit_tenant/,
      );
      assert.equal(await readCredential(id), null);
    },
  );

  it(
    "rejects duplicate credential registration without transferring ownership",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const tenant = tenantId();
      const ownerId = `webauthn-user-${randomUUID()}`;
      const attackerId = `webauthn-user-${randomUUID()}`;
      const id = await registerCredential({ tenant, userId: ownerId });
      userIds.add(attackerId);

      const duplicate = await registerVerifiedWebAuthnCredential({
        userId: attackerId,
        credentialId: id,
        publicKey: "different-public-key",
        counter: 0,
        deviceName: "Conflicting passkey",
        aaguid: null,
        transports: [],
        backupEligible: false,
        backupState: false,
        audit: mutationAudit({
          tenant,
          userId: attackerId,
          action: "credential.webauthn.register",
        }),
      });
      assert.deepEqual(duplicate, { ok: false, reason: "credential_conflict" });
      assert.equal((await readCredential(id))?.user_id, ownerId);
    },
  );

  it(
    "allows at most one concurrent nonzero counter transition",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const tenant = tenantId();
      const userId = `webauthn-user-${randomUUID()}`;
      const id = await registerCredential({ tenant, userId, counter: 0 });

      const [first, second] = await Promise.all([
        commitVerifiedWebAuthnCounterTransition({
          credentialId: id,
          expectedUserId: userId,
          nextCounter: 1,
          audit: authenticationAudit({ tenant, evidence: { attempt: 1 } }),
        }),
        commitVerifiedWebAuthnCounterTransition({
          credentialId: id,
          expectedUserId: userId,
          nextCounter: 1,
          audit: authenticationAudit({ tenant, evidence: { attempt: 2 } }),
        }),
      ]);

      assert.equal([first, second].filter((result) => result.ok).length, 1);
      assert.equal(
        [first, second].filter(
          (result) => !result.ok && result.reason === "counter_rollback",
        ).length,
        1,
      );
      assert.equal((await readCredential(id))?.counter, 1);
    },
  );

  it(
    "records counter rollback as durable clone-suspected evidence",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const tenant = tenantId();
      const userId = `webauthn-user-${randomUUID()}`;
      const id = await registerCredential({ tenant, userId, counter: 5 });

      const result = await commitVerifiedWebAuthnCounterTransition({
        credentialId: id,
        expectedUserId: userId,
        nextCounter: 5,
        audit: authenticationAudit({ tenant }),
      });
      assert.deepEqual(result, { ok: false, reason: "counter_rollback" });
      assert.equal((await readCredential(id))?.counter, 5);

      await withClient(async (client) => {
        const evidence = await client.query<{ metadata: Record<string, unknown> }>(
          `SELECT metadata
             FROM sensitive_mutation_audit_events
            WHERE tenant_id = $1
              AND actor_id = $2
              AND action = 'credential.webauthn.counter_rollback'
              AND outcome = 'rejected'
            LIMIT 1`,
          [tenant, userId],
        );
        assert.equal(evidence.rowCount, 1);
        assert.equal(evidence.rows[0]!.metadata.cloneSuspected, true);
        assert.equal(evidence.rows[0]!.metadata.storedCounter, 5);
        assert.equal(evidence.rows[0]!.metadata.receivedCounter, 5);
      });
    },
  );

  it(
    "rejects changed replay evidence and rolls back the second counter transition",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const tenant = tenantId();
      const userId = `webauthn-user-${randomUUID()}`;
      const id = await registerCredential({ tenant, userId, counter: 0 });
      const correlationId = `webauthn-replay-${randomUUID()}`;

      const first = await commitVerifiedWebAuthnCounterTransition({
        credentialId: id,
        expectedUserId: userId,
        nextCounter: 1,
        audit: authenticationAudit({
          tenant,
          correlationId,
          evidence: { nextCounter: 1 },
        }),
      });
      assert.equal(first.ok, true);

      await assert.rejects(
        commitVerifiedWebAuthnCounterTransition({
          credentialId: id,
          expectedUserId: userId,
          nextCounter: 2,
          audit: authenticationAudit({
            tenant,
            correlationId,
            evidence: { nextCounter: 2 },
          }),
        }),
        /sensitive_audit_correlation_conflict/,
      );
      assert.equal((await readCredential(id))?.counter, 1);
    },
  );

  it(
    "prevents cross-principal rename and revoke",
    { skip: !databaseConfigured, timeout: 20_000 },
    async () => {
      const tenant = tenantId();
      const ownerId = `webauthn-user-${randomUUID()}`;
      const attackerId = `webauthn-user-${randomUUID()}`;
      const id = await registerCredential({ tenant, userId: ownerId });
      userIds.add(attackerId);

      const rowId = await withClient(async (client) => {
        const result = await client.query<{ id: string }>(
          `SELECT id FROM webauthn_credentials WHERE credential_id = $1`,
          [id],
        );
        return result.rows[0]!.id;
      });

      const rename = await renameWebAuthnCredential({
        id: rowId,
        userId: attackerId,
        name: "Attacker rename",
        audit: mutationAudit({
          tenant,
          userId: attackerId,
          action: "credential.webauthn.rename",
        }),
      });
      assert.deepEqual(rename, { ok: false, status: "not_found" });

      const revoke = await revokeWebAuthnCredential({
        id: rowId,
        userId: attackerId,
        audit: mutationAudit({
          tenant,
          userId: attackerId,
          action: "credential.webauthn.revoke",
        }),
      });
      assert.deepEqual(revoke, { ok: false, status: "not_found" });

      const stored = await readCredential(id);
      assert.ok(stored);
      assert.equal(stored.device_name, "Primary passkey");
      assert.equal(stored.is_active, true);
    },
  );
});
