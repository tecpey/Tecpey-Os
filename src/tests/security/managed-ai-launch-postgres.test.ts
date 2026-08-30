import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pool } from "pg";
import {
  admitAiAgentExecution,
  createAiKnowledgeCandidate,
  markAiAgentSpendEgress,
  replaceAiAgentRouteCandidates,
  updateAiAgentBinding,
  updateAiProvider,
  type AdminAiMutationContext,
} from "../../lib/ai/control-plane-store";
import { aiAgentDefinition } from "../../lib/ai/control-plane-catalog";
import {
  aiAutomationEvidenceHash,
  enqueueAiAutomationRun,
  recordAiAutomationReview,
  updateAiAutomationPolicy,
} from "../../lib/ai/automation-store";

const databaseUrl = process.env.DATABASE_URL;
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

describe("managed AI launch PostgreSQL containment", () => {
  it(
    "returns the blocker before any managed control-plane or automation write",
    { skip: !configured, timeout: 20_000 },
    async () => {
      const tenantId = `launch-gate-${randomUUID()}`;
      const workspaceId = `${tenantId}-main`;
      const actorAdminId = randomUUID();
      const context: AdminAiMutationContext = {
        tenantId,
        workspaceId,
        actorAdminId,
        sessionId: `launch-gate:${randomUUID()}`,
        effectiveRoles: ["super_admin"],
      };
      const pool = new Pool({ connectionString: databaseUrl });
      const counts = async () => {
        const result = await pool.query<{
          providers: string;
          agents: string;
          routes: string;
          knowledge: string;
          policies: string;
          runs: string;
        }>(
          `SELECT
             (SELECT COUNT(*)::text FROM ai_provider_configs WHERE tenant_id = $1 AND workspace_id = $2) AS providers,
             (SELECT COUNT(*)::text FROM ai_agent_bindings WHERE tenant_id = $1 AND workspace_id = $2) AS agents,
             (SELECT COUNT(*)::text FROM ai_agent_route_candidates WHERE tenant_id = $1 AND workspace_id = $2) AS routes,
             (SELECT COUNT(*)::text FROM ai_knowledge_items WHERE tenant_id = $1 AND workspace_id = $2) AS knowledge,
             (SELECT COUNT(*)::text FROM ai_automation_policies WHERE tenant_id = $1 AND workspace_id = $2) AS policies,
             (SELECT COUNT(*)::text FROM ai_automation_runs WHERE tenant_id = $1 AND workspace_id = $2) AS runs`,
          [tenantId, workspaceId],
        );
        return result.rows[0];
      };

      try {
        const before = await counts();
        assert.ok(before);
        assert.equal(
          await updateAiProvider({
            ...context,
            providerId: "openai",
            enabled: true,
            apiKey: "test-only-secret",
          }),
          "tenant_isolation_unresolved",
        );
        const limits = { ...aiAgentDefinition("mentor_coach").defaultLimits };
        assert.equal(
          await updateAiAgentBinding({
            ...context,
            agentId: "mentor_coach",
            enabled: true,
            providerId: "openai",
            model: "gpt-4o-mini",
            limits,
            routing: {
              openRouterFallbackEnabled: false,
              openRouterModel: null,
              freeFallbackEnabled: false,
              openRouterCreditFloorUsdMicros: 0,
            },
          }),
          "tenant_isolation_unresolved",
        );
        assert.equal(
          await replaceAiAgentRouteCandidates({
            ...context,
            agentId: "mentor_coach",
            candidates: [{
              providerId: "openai",
              model: "gpt-4o-mini",
              priority: 1,
              enabled: true,
              estimatedMaxCostUsdMicros: 10_000,
              expectedLatencyMs: 1_000,
              zeroDataRetention: true,
              free: false,
              supportedDataClasses: ["private_user"],
            }],
          }),
          "tenant_isolation_unresolved",
        );
        assert.deepEqual(
          await admitAiAgentExecution({
            tenantId,
            workspaceId,
            agentId: "mentor_coach",
            configurationSource: "managed",
            idempotencyKey: `launch-gate:${randomUUID()}`,
            estimatedInputTokens: 10,
            maxOutputTokens: 64,
            limits,
          }),
          { ok: false, reason: "tenant_isolation_unresolved" },
        );
        assert.deepEqual(
          await markAiAgentSpendEgress({
            tenantId,
            workspaceId,
            agentId: "mentor_coach",
            configurationSource: "managed",
            reservationId: randomUUID(),
            attemptId: randomUUID(),
          }),
          { ok: false, reason: "tenant_isolation_unresolved" },
        );
        assert.equal(
          await createAiKnowledgeCandidate({
            tenantId,
            workspaceId,
            knowledgeType: "research_claim",
            subjectType: "launch_gate",
            statement: "This valid candidate must not reach managed storage while isolation is unresolved.",
            evidenceRefs: [{ url: "https://example.com/evidence", title: "Evidence" }],
            confidence: 80,
            dataClass: "public",
            derivedByAgent: "coin_tool_researcher",
          }),
          "tenant_isolation_unresolved",
        );
        assert.deepEqual(
          await updateAiAutomationPolicy({
            context,
            workflowId: "public_intelligence_digest",
            enabled: true,
            intervalMinutes: 60,
            maxConcurrency: 1,
            expectedRevision: 0,
          }),
          { ok: false, reason: "tenant_isolation_unresolved" },
        );
        assert.deepEqual(
          await enqueueAiAutomationRun({
            tenantId,
            workspaceId,
            workflowId: "public_intelligence_digest",
            triggerType: "manual",
            dataClass: "public",
            resourceType: "launch_gate",
            inputText: "Review this bounded public-source launch-gate test material.",
            idempotencyKey: `launch-gate:${randomUUID()}`,
            requestedBy: actorAdminId,
            context,
          }),
          { ok: false, reason: "tenant_isolation_unresolved" },
        );
        assert.deepEqual(
          await recordAiAutomationReview({
            tenantId,
            workspaceId,
            runId: randomUUID(),
            reviewKind: "manager",
            decision: "approve",
            summary: "Independent approval remains blocked by the tenant isolation gate.",
            evidenceHash: aiAutomationEvidenceHash("launch-gate-review"),
            reviewerAdminId: actorAdminId,
            reviewerRoles: ["super_admin"],
            context,
          }),
          { ok: false, reason: "tenant_isolation_unresolved" },
        );
        assert.deepEqual(
          await recordAiAutomationReview({
            tenantId,
            workspaceId,
            runId: randomUUID(),
            reviewKind: "ai_agent",
            decision: "approve",
            summary: "A leased AI approval cannot advance while tenant isolation is unresolved.",
            evidenceHash: aiAutomationEvidenceHash("launch-gate-ai-review"),
            reviewerAgentId: "coin_tool_researcher",
            workerId: "launch-gate-worker",
            providerId: "openai",
            model: "gpt-4o-mini",
          }),
          { ok: false, reason: "tenant_isolation_unresolved" },
        );
        assert.deepEqual(await counts(), before);
      } finally {
        await pool.end();
      }
    },
  );
});
