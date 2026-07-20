import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { PLATFORM } from "../../lib/platform-config";
import { fingerprintRiskPrincipal } from "../../lib/security/risk-enforcement-evidence";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

function principal(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

describe("Risk enforcement database guards", () => {
  it(
    "keeps risk events append-preserved and rejects forbidden detector metadata",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const principalId = principal("risk-schema-event");
      const eventKey = "a".repeat(64);
      const inserted = await withDb(async (client) => {
        await client.query(
          `INSERT INTO risk_authority_events
             (tenant_id, principal_id, principal_fingerprint, event_key,
              event_type, severity, policy_version, request_hash, detector_facts)
           VALUES ($1, $2, $3, $4, 'order_burst', 'low',
                   'risk-enforcement-authority-v1', $5, '{}'::jsonb)`,
          [
            PLATFORM.DEFAULT_TENANT_ID,
            principalId,
            fingerprintRiskPrincipal(principalId),
            eventKey,
            "b".repeat(64),
          ],
        );
        return true;
      });
      assert.equal(inserted.enabled, true);

      const updated = await withDb(async (client) => {
        await assert.rejects(
          client.query(
            `UPDATE risk_authority_events SET severity = 'medium'
              WHERE tenant_id = $1 AND event_key = $2`,
            [PLATFORM.DEFAULT_TENANT_ID, eventKey],
          ),
          /append-preserved/,
        );
        return true;
      });
      assert.equal(updated.enabled, true);

      const removed = await withDb(async (client) => {
        await assert.rejects(
          client.query(
            `DELETE FROM risk_authority_events
              WHERE tenant_id = $1 AND event_key = $2`,
            [PLATFORM.DEFAULT_TENANT_ID, eventKey],
          ),
          /append-preserved/,
        );
        return true;
      });
      assert.equal(removed.enabled, true);

      const forbiddenPrincipal = principal("risk-schema-forbidden");
      const forbidden = await withDb(async (client) => {
        await assert.rejects(
          client.query(
            `INSERT INTO risk_authority_events
               (tenant_id, principal_id, principal_fingerprint, event_key,
                event_type, severity, policy_version, request_hash, detector_facts)
             VALUES ($1, $2, $3, $4, 'order_burst', 'low',
                     'risk-enforcement-authority-v1', $5,
                     '{"ip":"203.0.113.1"}'::jsonb)`,
            [
              PLATFORM.DEFAULT_TENANT_ID,
              forbiddenPrincipal,
              fingerprintRiskPrincipal(forbiddenPrincipal),
              "c".repeat(64),
              "d".repeat(64),
            ],
          ),
          /check constraint|violates/i,
        );
        return true;
      });
      assert.equal(forbidden.enabled, true);
    },
  );

  it(
    "requires monotonic effective generations and append-preserved outbox identity",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const principalId = principal("risk-schema-generation");
      const fingerprint = fingerprintRiskPrincipal(principalId);
      const seeded = await withDb(async (client) => {
        await client.query(
          `INSERT INTO risk_effective_enforcements
             (tenant_id, principal_id, principal_fingerprint, level, generation,
              policy_version, request_hash, expires_at)
           VALUES ($1, $2, $3, 'review', 1,
                   'risk-enforcement-authority-v1', $4,
                   NOW() + INTERVAL '5 minutes')`,
          [PLATFORM.DEFAULT_TENANT_ID, principalId, fingerprint, "e".repeat(64)],
        );
        await client.query(
          `INSERT INTO risk_enforcement_outbox
             (tenant_id, principal_id, principal_fingerprint, generation,
              level, expires_at)
           VALUES ($1, $2, $3, 1, 'review', NOW() + INTERVAL '5 minutes')`,
          [PLATFORM.DEFAULT_TENANT_ID, principalId, fingerprint],
        );
        return true;
      });
      assert.equal(seeded.enabled, true);

      const generationGuard = await withDb(async (client) => {
        await assert.rejects(
          client.query(
            `UPDATE risk_effective_enforcements
                SET generation = 3, level = 'trade_blocked',
                    request_hash = $3,
                    expires_at = NOW() + INTERVAL '1 hour'
              WHERE tenant_id = $1 AND principal_id = $2`,
            [PLATFORM.DEFAULT_TENANT_ID, principalId, "f".repeat(64)],
          ),
          /generation must increment exactly once/,
        );
        return true;
      });
      assert.equal(generationGuard.enabled, true);

      const outboxIdentity = await withDb(async (client) => {
        await assert.rejects(
          client.query(
            `UPDATE risk_enforcement_outbox
                SET level = 'trade_blocked'
              WHERE tenant_id = $1 AND principal_id = $2 AND generation = 1`,
            [PLATFORM.DEFAULT_TENANT_ID, principalId],
          ),
          /identity is immutable/,
        );
        await assert.rejects(
          client.query(
            `DELETE FROM risk_enforcement_outbox
              WHERE tenant_id = $1 AND principal_id = $2 AND generation = 1`,
            [PLATFORM.DEFAULT_TENANT_ID, principalId],
          ),
          /append-preserved/,
        );
        return true;
      });
      assert.equal(outboxIdentity.enabled, true);
    },
  );
});
