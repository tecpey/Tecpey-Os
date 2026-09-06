import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const fingerprint = (value: string) =>
  createHash("sha256").update(value).digest("hex");

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function withRollback<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  await client.query("BEGIN");
  try {
    return await callback(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function expectRejected(
  client: PoolClient,
  action: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await client.query("SAVEPOINT expected_rejection");
  try {
    await assert.rejects(action(), pattern);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
    await client.query("RELEASE SAVEPOINT expected_rejection");
  }
}

async function seedTenant(client: PoolClient, label: string): Promise<string> {
  const tenantId = `identity-link-${label}-${randomUUID()}`;
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
     VALUES ($1, $1, $1, 'enterprise', ARRAY['academy','exchange','mentor'])`,
    [tenantId],
  );
  return tenantId;
}

async function seedPrincipal(
  client: PoolClient,
  tenantId: string,
  label: string,
): Promise<string> {
  const principalId = randomUUID();
  await client.query(
    `INSERT INTO platform_principals (id, tenant_id, status, locale, account_id)
     VALUES ($1, $2, 'active', 'en', $3)`,
    [principalId, tenantId, `account-${label}-${randomUUID()}`],
  );
  return principalId;
}

async function createProductAccount(
  client: PoolClient,
  input: {
    tenantId: string;
    principalId: string;
    product: "academy" | "exchange";
    suffix: string;
  },
): Promise<{ id: string; refHash: string }> {
  const refHash = fingerprint(`${input.product}:${input.suffix}`);
  const result = await client.query<{ id: string }>(
    `INSERT INTO platform_product_accounts
       (tenant_id, principal_id, product, product_account_ref_hash,
        fingerprint_key_version, binding_source)
     VALUES ($1, $2, $3, $4, 1, 'account_linking')
     RETURNING id`,
    [input.tenantId, input.principalId, input.product, refHash],
  );
  return { id: result.rows[0].id, refHash };
}

async function createPendingLink(
  client: PoolClient,
  input: {
    tenantId: string;
    principalId: string;
    sourceAccountId: string;
    sourceProduct?: "academy" | "exchange";
    targetProduct?: "academy" | "exchange";
    targetRefHash: string;
    scopes?: string[];
    suffix: string;
  },
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO product_account_link_transactions
       (tenant_id, principal_id, source_product_account_id,
        source_product, target_product, target_account_ref_hash,
        target_fingerprint_key_version, state_hash, proof_challenge_hash,
        redirect_uri_hash, requested_scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10,
        NOW() + INTERVAL '10 minutes')
     RETURNING id`,
    [
      input.tenantId,
      input.principalId,
      input.sourceAccountId,
      input.sourceProduct ?? "academy",
      input.targetProduct ?? "exchange",
      input.targetRefHash,
      fingerprint(`state:${input.suffix}`),
      fingerprint(`proof:${input.suffix}`),
      fingerprint(`redirect:${input.suffix}`),
      input.scopes ?? [],
    ],
  );
  return result.rows[0].id;
}

async function createCompletedLink(
  client: PoolClient,
  input: {
    tenantId: string;
    principalId: string;
    sourceAccountId: string;
    targetAccountId: string;
    targetRefHash: string;
    scopes?: string[];
    suffix: string;
  },
): Promise<string> {
  const linkId = await createPendingLink(client, input);
  await client.query(
    `UPDATE product_account_link_transactions
        SET target_product_account_id = $3, status = 'target_verified'
      WHERE tenant_id = $1 AND id = $2`,
    [input.tenantId, linkId, input.targetAccountId],
  );
  await client.query(
    `UPDATE product_account_link_transactions SET status = 'approved'
      WHERE tenant_id = $1 AND id = $2`,
    [input.tenantId, linkId],
  );
  await client.query(
    `UPDATE product_account_link_transactions SET status = 'completed'
      WHERE tenant_id = $1 AND id = $2`,
    [input.tenantId, linkId],
  );
  return linkId;
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Identity product-linking tenant, assurance and consent authority", () => {
  it(
    "isolates platform_product_accounts and retains closed account history while allowing a new live account",
    { skip: !configured, timeout: 30_000 },
    async () => withRollback(async (client) => {
      const tenantA = await seedTenant(client, "account-a");
      const tenantB = await seedTenant(client, "account-b");
      const principalA = await seedPrincipal(client, tenantA, "a");
      const principalB = await seedPrincipal(client, tenantB, "b");
      const accountA = await createProductAccount(client, {
        tenantId: tenantA,
        principalId: principalA,
        product: "exchange",
        suffix: randomUUID(),
      });

      await expectRejected(
        client,
        () => client.query(
          `INSERT INTO platform_product_accounts
             (tenant_id, principal_id, product, product_account_ref_hash,
              fingerprint_key_version, binding_source)
           VALUES ($1, $2, 'academy', $3, 1, 'account_linking')`,
          [tenantA, principalB, fingerprint(`forged:${randomUUID()}`)],
        ),
        /foreign key|violates/i,
      );

      await expectRejected(
        client,
        () => client.query(
          `UPDATE platform_product_accounts SET product_account_ref_hash = $1
            WHERE tenant_id = $2 AND id = $3`,
          [fingerprint(`changed:${randomUUID()}`), tenantA, accountA.id],
        ),
        /identity is immutable/i,
      );

      await expectRejected(
        client,
        () => client.query(
          `DELETE FROM platform_product_accounts WHERE tenant_id = $1 AND id = $2`,
          [tenantA, accountA.id],
        ),
        /retained|close instead of delete/i,
      );

      await client.query(
        `UPDATE platform_product_accounts SET status = 'closed'
          WHERE tenant_id = $1 AND id = $2`,
        [tenantA, accountA.id],
      );
      const replacement = await createProductAccount(client, {
        tenantId: tenantA,
        principalId: principalA,
        product: "exchange",
        suffix: randomUUID(),
      });
      assert.notEqual(replacement.id, accountA.id);

      await expectRejected(
        client,
        () => client.query(
          `UPDATE platform_product_accounts SET status = 'active'
            WHERE tenant_id = $1 AND id = $2`,
          [tenantA, accountA.id],
        ),
        /cannot be reopened/i,
      );

      const tenantAAccounts = await client.query<{ principal_id: string; status: string }>(
        `SELECT principal_id, status FROM platform_product_accounts
          WHERE tenant_id = $1 AND product = 'exchange' ORDER BY bound_at, id`,
        [tenantA],
      );
      assert.equal(tenantAAccounts.rowCount, 2);
      assert.ok(tenantAAccounts.rows.every((row) => row.principal_id === principalA));
      assert.deepEqual(
        new Set(tenantAAccounts.rows.map((row) => row.status)),
        new Set(["closed", "active"]),
      );
    }),
  );

  it(
    "forces product_account_link_transactions to start pending and binds exact source/target accounts",
    { skip: !configured, timeout: 30_000 },
    async () => withRollback(async (client) => {
      const tenantId = await seedTenant(client, "ceremony");
      const principalId = await seedPrincipal(client, tenantId, "owner");
      const otherPrincipalId = await seedPrincipal(client, tenantId, "other");
      const academy = await createProductAccount(client, {
        tenantId,
        principalId,
        product: "academy",
        suffix: randomUUID(),
      });
      const exchange = await createProductAccount(client, {
        tenantId,
        principalId,
        product: "exchange",
        suffix: randomUUID(),
      });
      const otherAcademy = await createProductAccount(client, {
        tenantId,
        principalId: otherPrincipalId,
        product: "academy",
        suffix: randomUUID(),
      });
      const otherExchange = await createProductAccount(client, {
        tenantId,
        principalId: otherPrincipalId,
        product: "exchange",
        suffix: randomUUID(),
      });

      await expectRejected(
        client,
        () => client.query(
          `INSERT INTO product_account_link_transactions
             (tenant_id, principal_id, source_product_account_id,
              source_product, target_product, target_product_account_id,
              target_account_ref_hash, state_hash, proof_challenge_hash,
              redirect_uri_hash, requested_scopes, status,
              target_verified_at, approved_at, expires_at)
           VALUES ($1, $2, $3, 'academy', 'exchange', $4, $5, $6, $7, $8,
              ARRAY['exchange.profile.summary.read'], 'approved', NOW(), NOW(),
              NOW() + INTERVAL '10 minutes')`,
          [
            tenantId,
            principalId,
            academy.id,
            exchange.id,
            exchange.refHash,
            fingerprint(`state:${randomUUID()}`),
            fingerprint(`proof:${randomUUID()}`),
            fingerprint(`redirect:${randomUUID()}`),
          ],
        ),
        /must start pending and unconsumed/i,
      );

      await expectRejected(
        client,
        () => createPendingLink(client, {
          tenantId,
          principalId,
          sourceAccountId: otherAcademy.id,
          targetRefHash: exchange.refHash,
          scopes: ["exchange.profile.summary.read"],
          suffix: randomUUID(),
        }),
        /source account must be active and owned by the principal/i,
      );

      const linkId = await createPendingLink(client, {
        tenantId,
        principalId,
        sourceAccountId: academy.id,
        targetRefHash: exchange.refHash,
        scopes: ["exchange.portfolio.risk_summary.read"],
        suffix: randomUUID(),
      });

      await expectRejected(
        client,
        () => client.query(
          `UPDATE product_account_link_transactions
              SET target_product_account_id = $3, status = 'target_verified'
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, linkId, otherExchange.id],
        ),
        /target account proof does not match|principal/i,
      );

      await client.query(
        `UPDATE product_account_link_transactions
            SET target_product_account_id = $3, status = 'target_verified'
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, linkId, exchange.id],
      );
      await client.query(
        `UPDATE product_account_link_transactions SET status = 'approved'
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, linkId],
      );
      await client.query(
        `UPDATE product_account_link_transactions SET status = 'completed'
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, linkId],
      );

      await expectRejected(
        client,
        () => client.query(
          `UPDATE product_account_link_transactions SET status = 'approved'
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, linkId],
        ),
        /terminal|invalid product account linking transition/i,
      );
      await expectRejected(
        client,
        () => client.query(
          `UPDATE product_account_link_transactions
              SET requested_scopes = ARRAY['exchange.profile.summary.read']
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, linkId],
        ),
        /ceremony identity is immutable|terminal/i,
      );

      const row = await client.query<{ status: string; consumed_at: Date | null }>(
        `SELECT status, consumed_at FROM product_account_link_transactions
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, linkId],
      );
      assert.equal(row.rows[0].status, "completed");
      assert.ok(row.rows[0].consumed_at);
    }),
  );

  it(
    "supports identity-only linking with zero data-sharing scopes",
    { skip: !configured, timeout: 30_000 },
    async () => withRollback(async (client) => {
      const tenantId = await seedTenant(client, "identity-only");
      const principalId = await seedPrincipal(client, tenantId, "identity-only");
      const academy = await createProductAccount(client, {
        tenantId,
        principalId,
        product: "academy",
        suffix: randomUUID(),
      });
      const exchange = await createProductAccount(client, {
        tenantId,
        principalId,
        product: "exchange",
        suffix: randomUUID(),
      });
      const linkId = await createCompletedLink(client, {
        tenantId,
        principalId,
        sourceAccountId: academy.id,
        targetAccountId: exchange.id,
        targetRefHash: exchange.refHash,
        scopes: [],
        suffix: randomUUID(),
      });
      const row = await client.query<{ requested_scopes: string[]; status: string }>(
        `SELECT requested_scopes, status FROM product_account_link_transactions
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, linkId],
      );
      assert.deepEqual(row.rows[0].requested_scopes, []);
      assert.equal(row.rows[0].status, "completed");
    }),
  );

  it(
    "keeps identity_assurance_records append-only and deterministically revocable after Exchange suspension",
    { skip: !configured, timeout: 30_000 },
    async () => withRollback(async (client) => {
      const tenantId = await seedTenant(client, "assurance");
      const principalId = await seedPrincipal(client, tenantId, "assurance-owner");
      const otherPrincipalId = await seedPrincipal(client, tenantId, "assurance-other");
      const exchange = await createProductAccount(client, {
        tenantId,
        principalId,
        product: "exchange",
        suffix: randomUUID(),
      });

      const verified = await client.query<{ id: string; event_sequence: string }>(
        `INSERT INTO identity_assurance_records
           (tenant_id, principal_id, exchange_product_account_id, status,
            assurance_level, jurisdiction, policy_version, verified_at,
            provider_subject_ref_hash, provider_fingerprint_key_version)
         VALUES ($1, $2, $3, 'verified', 'kyc-level-2', 'IR',
            'tecpey-identity-assurance-v1', NOW(), $4, 1)
         RETURNING id, event_sequence::text`,
        [tenantId, principalId, exchange.id, fingerprint(`provider:${randomUUID()}`)],
      );

      await expectRejected(
        client,
        () => client.query(
          `INSERT INTO identity_assurance_records
             (tenant_id, principal_id, exchange_product_account_id, status,
              assurance_level, jurisdiction, policy_version, verified_at)
           VALUES ($1, $2, $3, 'verified', 'kyc-level-2', 'IR',
              'tecpey-identity-assurance-v1', NOW())`,
          [tenantId, otherPrincipalId, exchange.id],
        ),
        /own Exchange product account|violates/i,
      );
      await expectRejected(
        client,
        () => client.query(
          `UPDATE identity_assurance_records SET assurance_level = 'changed'
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, verified.rows[0].id],
        ),
        /append-only/i,
      );
      await expectRejected(
        client,
        () => client.query(
          `DELETE FROM identity_assurance_records WHERE tenant_id = $1 AND id = $2`,
          [tenantId, verified.rows[0].id],
        ),
        /append-only/i,
      );

      const effectiveBefore = await client.query(
        `SELECT 1 FROM identity_effective_assurance
          WHERE tenant_id = $1 AND principal_id = $2`,
        [tenantId, principalId],
      );
      assert.equal(effectiveBefore.rowCount, 1);

      await client.query(
        `UPDATE platform_product_accounts SET status = 'suspended'
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, exchange.id],
      );
      const effectiveAfterSuspend = await client.query(
        `SELECT 1 FROM identity_effective_assurance
          WHERE tenant_id = $1 AND principal_id = $2`,
        [tenantId, principalId],
      );
      assert.equal(effectiveAfterSuspend.rowCount, 0);

      const revoked = await client.query<{ event_sequence: string }>(
        `INSERT INTO identity_assurance_records
           (tenant_id, principal_id, exchange_product_account_id, status,
            assurance_level, jurisdiction, policy_version, supersedes_id)
         VALUES ($1, $2, $3, 'revoked', 'kyc-level-2', 'IR',
            'tecpey-identity-assurance-v1', $4)
         RETURNING event_sequence::text`,
        [tenantId, principalId, exchange.id, verified.rows[0].id],
      );
      assert.ok(BigInt(revoked.rows[0].event_sequence) > BigInt(verified.rows[0].event_sequence));

      const current = await client.query<{ status: string }>(
        `SELECT status FROM identity_current_assurance
          WHERE tenant_id = $1 AND principal_id = $2`,
        [tenantId, principalId],
      );
      assert.equal(current.rows[0].status, "revoked");
    }),
  );

  it(
    "makes product_data_consent_events scope-exact, append-only and revocable after Exchange suspension without unlinking identity",
    { skip: !configured, timeout: 30_000 },
    async () => withRollback(async (client) => {
      const tenantId = await seedTenant(client, "consent");
      const principalId = await seedPrincipal(client, tenantId, "consent");
      const academy = await createProductAccount(client, {
        tenantId,
        principalId,
        product: "academy",
        suffix: randomUUID(),
      });
      const exchange = await createProductAccount(client, {
        tenantId,
        principalId,
        product: "exchange",
        suffix: randomUUID(),
      });
      const scope = "exchange.portfolio.risk_summary.read";
      const linkId = await createCompletedLink(client, {
        tenantId,
        principalId,
        sourceAccountId: academy.id,
        targetAccountId: exchange.id,
        targetRefHash: exchange.refHash,
        scopes: [scope, "exchange.behavior.risk_signals.read"],
        suffix: randomUUID(),
      });

      const grant = await client.query<{ id: string; event_sequence: string }>(
        `INSERT INTO product_data_consent_events
           (tenant_id, principal_id, link_transaction_id,
            exchange_product_account_id, receiving_service, purpose,
            scope, status, policy_version, correlation_id, idempotency_key)
         VALUES ($1, $2, $3, $4, 'mentor', 'mentor_risk_coaching', $5,
            'granted', 'tecpey-product-data-consent-v1', $6, $7)
         RETURNING id, event_sequence::text`,
        [
          tenantId,
          principalId,
          linkId,
          exchange.id,
          scope,
          `correlation-${randomUUID()}`,
          `grant-${randomUUID()}`,
        ],
      );

      await expectRejected(
        client,
        () => client.query(
          `UPDATE product_data_consent_events SET status = 'revoked'
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, grant.rows[0].id],
        ),
        /append-only/i,
      );
      await expectRejected(
        client,
        () => client.query(
          `INSERT INTO product_data_consent_events
             (tenant_id, principal_id, link_transaction_id,
              exchange_product_account_id, receiving_service, purpose,
              scope, status, policy_version, correlation_id, idempotency_key)
           VALUES ($1, $2, $3, $4, 'mentor', 'mentor_personalization',
              'exchange.profile.summary.read', 'granted',
              'tecpey-product-data-consent-v1', $5, $6)`,
          [tenantId, principalId, linkId, exchange.id,
           `correlation-${randomUUID()}`, `unrequested-${randomUUID()}`],
        ),
        /requested scope|completed exact-account link ceremony/i,
      );
      await expectRejected(
        client,
        () => client.query(
          `INSERT INTO product_data_consent_events
             (tenant_id, principal_id, link_transaction_id,
              exchange_product_account_id, receiving_service, purpose,
              scope, status, policy_version, correlation_id, idempotency_key)
           VALUES ($1, $2, $3, $4, 'mentor', 'mentor_risk_coaching',
              'exchange.orders.write', 'granted',
              'tecpey-product-data-consent-v1', $5, $6)`,
          [tenantId, principalId, linkId, exchange.id,
           `correlation-${randomUUID()}`, `forbidden-${randomUUID()}`],
        ),
        /check constraint|violates/i,
      );
      await expectRejected(
        client,
        () => client.query(
          `INSERT INTO product_data_consent_events
             (tenant_id, principal_id, link_transaction_id,
              exchange_product_account_id, receiving_service, purpose,
              scope, status, policy_version, correlation_id, idempotency_key)
           VALUES ($1, $2, $3, $4, 'mentor', 'cross_product_profile', $5,
              'granted', 'tecpey-product-data-consent-v1', $6, $7)`,
          [tenantId, principalId, linkId, exchange.id, scope,
           `correlation-${randomUUID()}`, `purpose-${randomUUID()}`],
        ),
        /check constraint|violates/i,
      );

      const activeBefore = await client.query(
        `SELECT 1 FROM product_data_effective_consents
          WHERE tenant_id = $1 AND principal_id = $2
            AND exchange_product_account_id = $3
            AND receiving_service = 'mentor'
            AND purpose = 'mentor_risk_coaching' AND scope = $4`,
        [tenantId, principalId, exchange.id, scope],
      );
      assert.equal(activeBefore.rowCount, 1);

      await client.query(
        `UPDATE platform_product_accounts SET status = 'suspended'
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, exchange.id],
      );
      const activeAfterSuspend = await client.query(
        `SELECT 1 FROM product_data_effective_consents
          WHERE tenant_id = $1 AND principal_id = $2
            AND exchange_product_account_id = $3`,
        [tenantId, principalId, exchange.id],
      );
      assert.equal(activeAfterSuspend.rowCount, 0);

      await expectRejected(
        client,
        () => client.query(
          `INSERT INTO product_data_consent_events
             (tenant_id, principal_id, link_transaction_id,
              exchange_product_account_id, receiving_service, purpose,
              scope, status, policy_version, correlation_id, idempotency_key)
           VALUES ($1, $2, $3, $4, 'mentor', 'mentor_risk_coaching', $5,
              'granted', 'tecpey-product-data-consent-v1', $6, $7)`,
          [tenantId, principalId, linkId, exchange.id, scope,
           `correlation-${randomUUID()}`, `grant-suspended-${randomUUID()}`],
        ),
        /requires an active Exchange account/i,
      );

      const revoked = await client.query<{ event_sequence: string }>(
        `INSERT INTO product_data_consent_events
           (tenant_id, principal_id, link_transaction_id,
            exchange_product_account_id, receiving_service, purpose,
            scope, status, policy_version, correlation_id, idempotency_key)
         VALUES ($1, $2, $3, $4, 'mentor', 'mentor_risk_coaching', $5,
            'revoked', 'tecpey-product-data-consent-v1', $6, $7)
         RETURNING event_sequence::text`,
        [tenantId, principalId, linkId, exchange.id, scope,
         `correlation-${randomUUID()}`, `revoke-${randomUUID()}`],
      );
      assert.ok(BigInt(revoked.rows[0].event_sequence) > BigInt(grant.rows[0].event_sequence));

      const latest = await client.query<{ status: string }>(
        `SELECT status FROM product_data_consent_events
          WHERE tenant_id = $1 AND principal_id = $2
            AND exchange_product_account_id = $3
            AND receiving_service = 'mentor'
            AND purpose = 'mentor_risk_coaching' AND scope = $4
          ORDER BY event_sequence DESC LIMIT 1`,
        [tenantId, principalId, exchange.id, scope],
      );
      assert.equal(latest.rows[0].status, "revoked");

      const link = await client.query<{ status: string }>(
        `SELECT status FROM product_account_link_transactions
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, linkId],
      );
      assert.equal(link.rows[0].status, "completed");
    }),
  );
});
