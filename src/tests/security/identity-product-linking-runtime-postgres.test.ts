import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  IdentityLinkingRuntimeError,
  appendIdentityAssuranceTx,
  appendProductDataConsentTx,
  approveProductAccountLinkTx,
  completeProductAccountLinkTx,
  startProductAccountLinkingTx,
  verifyTargetProductAccountTx,
} from "../../lib/security/identity-product-linking-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
const TEST_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef-runtime-linking-postgres-key",
  "utf8",
);
const REDIRECT_URI = "https://tecpey.com/api/identity/exchange-link/callback";
let pool: Pool | null = null;

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

async function seedPrincipal(client: PoolClient) {
  const tenantId = `runtime-link-${randomUUID()}`;
  const principalId = randomUUID();
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
     VALUES ($1, $1, $1, 'enterprise', ARRAY['academy','exchange','mentor'])`,
    [tenantId],
  );
  await client.query(
    `INSERT INTO platform_principals
       (id, tenant_id, status, locale, account_id)
     VALUES ($1, $2, 'active', 'en', $3)`,
    [principalId, tenantId, `academy-${randomUUID()}`],
  );
  return { tenantId, principalId };
}

function expectRuntimeCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  return assert.rejects(
    promise,
    (error) => error instanceof IdentityLinkingRuntimeError && error.code === code,
  );
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 3, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Identity product-linking runtime PostgreSQL authority", () => {
  it(
    "executes the authenticated one-time link ceremony, assurance and revocable Mentor consent without persisting raw account refs",
    { skip: !configured, timeout: 30_000 },
    async () => withRollback(async (client) => {
      const { tenantId, principalId } = await seedPrincipal(client);
      const sourceRef = `academy-account-${randomUUID()}`;
      const targetRef = `exchange-account-${randomUUID()}`;
      const scope = "exchange.portfolio.risk_summary.read";

      const started = await startProductAccountLinkingTx(client, {
        tenantId,
        principalId,
        sourceProduct: "academy",
        sourceExternalAccountRef: sourceRef,
        targetProduct: "exchange",
        targetExternalAccountRef: targetRef,
        redirectUri: REDIRECT_URI,
        allowedRedirectUris: [REDIRECT_URI],
        scopes: [scope, "exchange.behavior.risk_signals.read"],
        key: TEST_KEY,
      });

      const persisted = await client.query<{
        target_account_ref_hash: string;
        state_hash: string;
        proof_challenge_hash: string;
        redirect_uri_hash: string;
        status: string;
      }>(
        `SELECT target_account_ref_hash, state_hash, proof_challenge_hash,
                redirect_uri_hash, status
           FROM product_account_link_transactions
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, started.linkTransactionId],
      );
      assert.equal(persisted.rows[0].status, "pending");
      const persistedJson = JSON.stringify(persisted.rows[0]);
      assert.equal(persistedJson.includes(sourceRef), false);
      assert.equal(persistedJson.includes(targetRef), false);
      assert.equal(persistedJson.includes(started.state), false);
      assert.equal(persistedJson.includes(started.proofVerifier), false);

      await expectRuntimeCode(
        verifyTargetProductAccountTx(client, {
          tenantId,
          state: started.state,
          targetExternalAccountRef: `${targetRef}-wrong`,
          key: TEST_KEY,
        }),
        "ceremony_target_mismatch",
      );

      const targetVerified = await verifyTargetProductAccountTx(client, {
        tenantId,
        state: started.state,
        targetExternalAccountRef: targetRef,
        key: TEST_KEY,
      });
      assert.equal(targetVerified.principalId, principalId);
      assert.ok(targetVerified.targetProductAccountId);

      await approveProductAccountLinkTx(client, {
        tenantId,
        state: started.state,
      });

      await expectRuntimeCode(
        completeProductAccountLinkTx(client, {
          tenantId,
          state: started.state,
          proofVerifier: `${started.proofVerifier}-wrong`,
          redirectUri: REDIRECT_URI,
          allowedRedirectUris: [REDIRECT_URI],
        }),
        "proof_verifier_invalid",
      );

      const completed = await completeProductAccountLinkTx(client, {
        tenantId,
        state: started.state,
        proofVerifier: started.proofVerifier,
        redirectUri: REDIRECT_URI,
        allowedRedirectUris: [REDIRECT_URI],
      });
      assert.equal(completed.principalId, principalId);
      assert.equal(
        completed.exchangeProductAccountId,
        targetVerified.targetProductAccountId,
      );

      const assurance = await appendIdentityAssuranceTx(client, {
        tenantId,
        principalId,
        exchangeProductAccountId: completed.exchangeProductAccountId,
        status: "verified",
        assuranceLevel: "kyc-level-2",
        jurisdiction: "IR",
        providerSubjectRef: `provider-subject-${randomUUID()}`,
        key: TEST_KEY,
      });
      assert.ok(assurance.id);

      const grantKey = `grant-${randomUUID()}`;
      const grant = await appendProductDataConsentTx(client, {
        tenantId,
        principalId,
        linkTransactionId: completed.linkTransactionId,
        exchangeProductAccountId: completed.exchangeProductAccountId,
        receivingService: "mentor",
        purpose: "mentor_risk_coaching",
        scope,
        status: "granted",
        correlationId: `correlation-${randomUUID()}`,
        idempotencyKey: grantKey,
        jurisdiction: "IR",
      });
      assert.equal(grant.replayed, false);

      const replay = await appendProductDataConsentTx(client, {
        tenantId,
        principalId,
        linkTransactionId: completed.linkTransactionId,
        exchangeProductAccountId: completed.exchangeProductAccountId,
        receivingService: "mentor",
        purpose: "mentor_risk_coaching",
        scope,
        status: "granted",
        correlationId: `different-correlation-${randomUUID()}`,
        idempotencyKey: grantKey,
        jurisdiction: "IR",
      });
      assert.equal(replay.replayed, true);
      assert.equal(replay.id, grant.id);

      const effectiveBefore = await client.query<{ scope: string }>(
        `SELECT scope FROM product_data_effective_consents
          WHERE tenant_id = $1 AND principal_id = $2
            AND receiving_service = 'mentor' AND scope = $3`,
        [tenantId, principalId, scope],
      );
      assert.deepEqual(effectiveBefore.rows.map((row) => row.scope), [scope]);

      await appendProductDataConsentTx(client, {
        tenantId,
        principalId,
        linkTransactionId: completed.linkTransactionId,
        exchangeProductAccountId: completed.exchangeProductAccountId,
        receivingService: "mentor",
        purpose: "mentor_risk_coaching",
        scope,
        status: "revoked",
        correlationId: `correlation-${randomUUID()}`,
        idempotencyKey: `revoke-${randomUUID()}`,
        jurisdiction: "IR",
      });

      const effectiveAfter = await client.query(
        `SELECT 1 FROM product_data_effective_consents
          WHERE tenant_id = $1 AND principal_id = $2
            AND receiving_service = 'mentor' AND scope = $3`,
        [tenantId, principalId, scope],
      );
      assert.equal(effectiveAfter.rowCount, 0);

      await expectRuntimeCode(
        appendProductDataConsentTx(client, {
          tenantId,
          principalId,
          linkTransactionId: completed.linkTransactionId,
          exchangeProductAccountId: completed.exchangeProductAccountId,
          receivingService: "mentor",
          purpose: "mentor_risk_coaching",
          scope: "exchange.orders.write",
          status: "granted",
          correlationId: `correlation-${randomUUID()}`,
          idempotencyKey: `forbidden-${randomUUID()}`,
        }),
        "invalid_scope",
      );
    }),
  );
});
