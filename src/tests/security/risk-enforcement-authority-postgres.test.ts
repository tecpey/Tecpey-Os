import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { PLATFORM } from "../../lib/platform-config";
import {
  recordRiskDecision,
  resolveRiskEnforcement,
} from "../../lib/security/risk-enforcement-authority";
import {
  RISK_ENFORCEMENT_POLICY_VERSION,
  fingerprintRiskDetectorValue,
  fingerprintRiskEventIdentity,
  fingerprintRiskPrincipal,
  writeRiskEvidenceTx,
} from "../../lib/security/risk-enforcement-evidence";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

function principal(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function loadAuthority(principalId: string) {
  const result = await withDb(async (client) => {
    const events = await client.query<{
      id: string;
      event_type: string;
      severity: string;
      document: string;
    }>(
      `SELECT id, event_type, severity, row_to_json(event)::text AS document
         FROM risk_authority_events event
        WHERE tenant_id = $1 AND principal_id = $2
        ORDER BY created_at`,
      [PLATFORM.DEFAULT_TENANT_ID, principalId],
    );
    const enforcement = await client.query<{
      level: string;
      generation: number;
      expires_at: Date | null;
    }>(
      `SELECT level, generation::integer AS generation, expires_at
         FROM risk_effective_enforcements
        WHERE tenant_id = $1 AND principal_id = $2`,
      [PLATFORM.DEFAULT_TENANT_ID, principalId],
    );
    const outbox = await client.query<{
      generation: number;
      level: string;
      state: string;
      attempts: number;
    }>(
      `SELECT generation::integer AS generation, level, state, attempts
         FROM risk_enforcement_outbox
        WHERE tenant_id = $1 AND principal_id = $2
        ORDER BY generation`,
      [PLATFORM.DEFAULT_TENANT_ID, principalId],
    );
    const audit = await client.query<{
      action: string;
      document: string;
    }>(
      `SELECT action, row_to_json(event)::text AS document
         FROM sensitive_mutation_audit_events event
        WHERE action IN ('risk.event.record', 'risk.enforcement.apply')
          AND metadata->>'principalFingerprint' = encode(
            digest('tecpey:risk-principal:v1' || chr(31) || $1, 'sha256'),
            'hex'
          )
        ORDER BY created_at`,
      [principalId],
    );
    return {
      events: events.rows,
      enforcement: enforcement.rows[0] ?? null,
      outbox: outbox.rows,
      audit: audit.rows,
    };
  });
  assert.equal(result.enabled, true);
  if (!result.enabled) throw new Error("risk_test_database_unavailable");
  return result.value;
}

describe("Risk enforcement transaction authority", () => {
  it(
    "replays one detector decision without duplicating event, generation or evidence",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const principalId = principal("risk-replay");
      const detectorIdentity = `duplicate:${randomUUID()}`;
      const previousRedis = globalThis.tecpeyRedisClient;
      globalThis.tecpeyRedisClient = undefined;
      try {
        const first = await recordRiskDecision({
          principalId,
          eventType: "duplicate_request",
          severity: "medium",
          detectorIdentity,
          market: "BTC-USDT",
          detectorFacts: {
            orderFingerprint: fingerprintRiskDetectorValue(detectorIdentity),
            windowSeconds: 5,
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
        const replay = await recordRiskDecision({
          principalId,
          eventType: "duplicate_request",
          severity: "medium",
          detectorIdentity,
          market: "BTC-USDT",
          detectorFacts: {
            orderFingerprint: fingerprintRiskDetectorValue(detectorIdentity),
            windowSeconds: 5,
          },
        });

        assert.equal(first.replayed, false);
        assert.equal(first.effectiveLevel, "review");
        assert.equal(first.generation, 1);
        assert.equal(first.projectionPublished, false);
        assert.equal(replay.replayed, true);
        assert.equal(replay.effectiveLevel, "review");
        assert.equal(replay.generation, 1);

        const state = await loadAuthority(principalId);
        assert.equal(state.events.length, 1);
        assert.equal(state.enforcement?.level, "review");
        assert.equal(state.enforcement?.generation, 1);
        assert.equal(state.outbox.length, 1);
        assert.equal(state.outbox[0]?.generation, 1);
        assert.equal(state.outbox[0]?.state, "dead_letter");
        assert.deepEqual(
          state.audit.map((row) => row.action),
          ["risk.event.record", "risk.enforcement.apply"],
        );
        assert.equal(state.events[0]?.document.includes(detectorIdentity), false);
        for (const row of state.audit) {
          assert.equal(row.document.includes(principalId), false);
          assert.equal(row.document.includes(detectorIdentity), false);
        }

        const resolved = await resolveRiskEnforcement(principalId);
        assert.equal(resolved.available, true);
        if (resolved.available) {
          assert.equal(resolved.level, "review");
          assert.equal(resolved.generation, 1);
        }
      } finally {
        globalThis.tecpeyRedisClient = previousRedis;
      }
    },
  );

  it(
    "rolls back event, effective enforcement and outbox when mandatory event evidence conflicts",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const principalId = principal("risk-evidence-conflict");
      const detectorIdentity = `conflict:${randomUUID()}`;
      const detectorFingerprint = fingerprintRiskDetectorValue(detectorIdentity);
      const eventKey = fingerprintRiskEventIdentity(
        [
          PLATFORM.DEFAULT_TENANT_ID,
          principalId,
          "duplicate_request",
          detectorFingerprint,
          RISK_ENFORCEMENT_POLICY_VERSION,
        ].join("\u001f"),
      );

      const conflict = await withDb(async (client) => {
        await writeRiskEvidenceTx(client, {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorId: "risk-engine",
          action: "risk.event.record",
          resourceType: "risk_event",
          resourceIdentity: eventKey,
          correlationIdentity: eventKey,
          requestHash: "f".repeat(64),
          outcome: "success",
          metadata: {
            principalFingerprint: fingerprintRiskPrincipal(principalId),
            marker: "forced-correlation-conflict",
          },
        });
        return true;
      });
      assert.equal(conflict.enabled, true);

      await assert.rejects(
        recordRiskDecision({
          principalId,
          eventType: "duplicate_request",
          severity: "medium",
          detectorIdentity,
          market: "ETH-USDT",
          detectorFacts: {
            orderFingerprint: detectorFingerprint,
            windowSeconds: 5,
          },
        }),
        /sensitive_audit_correlation_conflict/,
      );

      const state = await loadAuthority(principalId);
      assert.equal(state.events.length, 0);
      assert.equal(state.enforcement, null);
      assert.equal(state.outbox.length, 0);
      assert.equal(state.audit.length, 1);
      assert.equal(state.audit[0]?.action, "risk.event.record");
    },
  );

  it(
    "serializes concurrent decisions and leaves one current projection generation",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const principalId = principal("risk-concurrent");
      const previousRedis = globalThis.tecpeyRedisClient;
      globalThis.tecpeyRedisClient = undefined;
      try {
        const [review, block] = await Promise.all([
          recordRiskDecision({
            principalId,
            eventType: "duplicate_request",
            severity: "medium",
            detectorIdentity: `review:${randomUUID()}`,
            market: "SOL-USDT",
            detectorFacts: { windowSeconds: 5 },
          }),
          recordRiskDecision({
            principalId,
            eventType: "order_frequency_high",
            severity: "high",
            detectorIdentity: `block:${randomUUID()}`,
            market: "SOL-USDT",
            detectorFacts: { observedCount: 11, threshold: 10 },
          }),
        ]);
        assert.equal(review.replayed, false);
        assert.equal(block.replayed, false);

        const state = await loadAuthority(principalId);
        assert.equal(state.events.length, 2);
        assert.equal(state.enforcement?.level, "trade_blocked");
        assert.equal(state.enforcement?.generation, 2);
        assert.deepEqual(
          state.outbox.map((row) => [row.generation, row.state]),
          [
            [1, "completed"],
            [2, "dead_letter"],
          ],
        );
        assert.equal(
          state.audit.filter((row) => row.action === "risk.event.record").length,
          2,
        );
        assert.equal(
          state.audit.filter((row) => row.action === "risk.enforcement.apply").length,
          2,
        );
      } finally {
        globalThis.tecpeyRedisClient = previousRedis;
      }
    },
  );
});
