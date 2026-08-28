import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const source = (path: string) => readFile(path, "utf8");

describe("AI control-plane source authority", () => {
  it("keeps provider URLs fixed and secrets out of admin snapshots", async () => {
    const [route, router, store] = await Promise.all([
      source("src/app/api/command-center/ai-control-plane/route.ts"),
      source("src/lib/ai/provider-router.ts"),
      source("src/lib/ai/control-plane-store.ts"),
    ]);
    assert.doesNotMatch(route, /body\.(?:url|endpoint|host)/);
    assert.match(router, /https:\/\/api\.openai\.com\/v1\/responses/);
    assert.match(router, /https:\/\/api\.anthropic\.com\/v1\/messages/);
    assert.match(router, /https:\/\/api\.perplexity\.ai\/v1\/agent/);
    assert.match(router, /https:\/\/api\.x\.ai\/v1\/responses/);
    assert.match(
      store,
      /secretConfigured: Boolean\(row\?\.encrypted_api_key\)/,
    );
    assert.match(store, /tenantId === PLATFORM\.DEFAULT_TENANT_ID/);
    assert.match(store, /workspaceId === PLATFORM\.DEFAULT_WORKSPACE_ID/);
    assert.doesNotMatch(
      store.slice(
        store.indexOf("function providerSnapshot"),
        store.indexOf("function limitsFromAgentRow"),
      ),
      /apiKey:/,
    );
  });

  it("requires role permission, step-up, bounded bodies, citations and human knowledge review", async () => {
    const route = await source(
      "src/app/api/command-center/ai-control-plane/route.ts",
    );
    assert.match(
      route,
      /authorizeAdminRequest\(request, "mentor\.policy\.manage", \{\s*stepUpWithinSeconds: 300/,
    );
    assert.match(
      route,
      /authorizeAdminRequest\(request, "ai\.research\.run"\)/,
    );
    assert.match(
      route,
      /authorizeAdminRequest\(request, "ai\.knowledge\.review", \{\s*stepUpWithinSeconds: 300/,
    );
    assert.match(
      route,
      /readBoundedJsonRequest\(request, \{ maxBytes: 16_384 \}\)/,
    );
    assert.match(route, /const cited = provider\.sources\.length > 0/);
    assert.match(route, /knowledgeAuthority: candidate \? "candidate_only"/);
  });

  it("treats a parsed non-empty provider response as connectivity success", async () => {
    const [route, panel] = await Promise.all([
      source("src/app/api/command-center/ai-control-plane/route.ts"),
      source("src/components/admin/AiControlPlanePanel.tsx"),
    ]);
    assert.match(route, /passed = result\.ok;/);
    assert.match(route, /failureReason = result\.ok \? null : result\.reason;/);
    assert.doesNotMatch(route, /result\.text\.includes\("TECPEY_PROVIDER_OK"\)/);
    assert.match(
      route,
      /maxOutputTokens: providerId === "openrouter" \? 8_192 : 1_200/,
    );
    assert.match(route, /attempts,\s*providerStatus,\s*testedModel,/);
    assert.match(panel, /const text = providerTestMessage\(data\);/);
    assert.match(panel, /rate_limited: "ظرفیت مدل انتخاب‌شده موقتاً محدود است/);
    assert.match(panel, /سامانه پس از.*تلاش کنترل‌شده بازیابی شد/);
  });

  it("makes Mentor threads server-owned and user-bound", async () => {
    const [threads, conversations, migration, mentor, widget, coach] =
      await Promise.all([
        source("src/app/api/mentor-threads/route.ts"),
        source("src/app/api/mentor-conversations/route.ts"),
        source("src/app/api/mentor-conversations/migrate/route.ts"),
        source("src/app/api/ai-mentor/route.ts"),
        source("src/components/academy/GlobalAiMentorWidget.tsx"),
        source("src/components/academy/AiMentorExperience.tsx"),
      ]);
    assert.match(threads, /strictRevocation: true/);
    assert.match(threads, /studentId: authorization\.context\.principalId/);
    assert.match(conversations, /mc\.thread_id = \$4::uuid/);
    assert.match(migration, /resolveTenantPrincipalContext\(\{/);
    assert.match(
      migration,
      /requireTenantProduct\(tenantContext\.tenantId, "mentor"\)/,
    );
    assert.match(
      migration,
      /inspection\.blocked \|\| inspection\.injectionSignals\.length > 0/,
    );
    assert.match(
      mentor,
      /getMentorContext\(authorizedStudentId, activeThreadId\)/,
    );
    assert.match(mentor, /threadId: activeThreadId/);
    assert.doesNotMatch(widget, /history: history\.slice/);
    assert.doesNotMatch(coach, /localStorage/);
  });

  it("enforces atomic tenant-scoped daily request and token reservations", async () => {
    const [migration, store] = await Promise.all([
      source("src/lib/db-migrate-ai-control-plane.ts"),
      source("src/lib/ai/control-plane-store.ts"),
    ]);
    assert.match(
      migration,
      /PRIMARY KEY \(tenant_id, workspace_id, agent_id, usage_date\)/,
    );
    assert.match(
      store,
      /ON CONFLICT \(tenant_id, workspace_id, agent_id, usage_date\) DO UPDATE/,
    );
    assert.match(store, /request_count < \$5/);
    assert.match(store, /reserved_tokens \+ EXCLUDED\.reserved_tokens <= \$6/);
  });

  it("retrieves only human-verified, current and tenant-scoped knowledge for Mentor", async () => {
    const [store, mentor, trust] = await Promise.all([
      source("src/lib/ai/control-plane-store.ts"),
      source("src/app/api/ai-mentor/route.ts"),
      source("src/lib/ai/mentor-trust-boundary.ts"),
    ]);
    assert.match(store, /status = 'verified'/);
    assert.match(store, /reviewed_by IS NOT NULL/);
    assert.match(store, /WHERE ai_knowledge_items\.status = 'candidate'/);
    assert.match(store, /if \(!row\) return null/);
    assert.match(
      store,
      /input\.knowledgeType !== "operating_rule" && evidenceRefs\.length === 0/,
    );
    assert.match(store, /valid_from <= NOW\(\)/);
    assert.match(store, /tenant_id = \$1[\s\S]*workspace_id = \$2/);
    assert.match(store, /plainto_tsquery\('simple', \$3\)/);
    assert.match(mentor, /loadVerifiedAiKnowledgeContext\(\{/);
    assert.match(trust, /approvedKnowledgeIsQuotedReferenceData: true/);
    assert.match(
      trust,
      /inspection\.blocked \|\| inspection\.injectionSignals\.length > 0/,
    );
  });

  it("keeps user-facing live research public-only, cited and separate from private Mentor context", async () => {
    const [mentor, trust] = await Promise.all([
      source("src/app/api/ai-mentor/route.ts"),
      source("src/lib/ai/mentor-trust-boundary.ts"),
    ]);
    assert.match(mentor, /body\.researchMode === "public"/);
    assert.match(
      mentor,
      /resolveRuntimeAiAgent\(selectedResearchRoute\.agentId/,
    );
    assert.match(mentor, /const cited = researchProvider\.sources\.length > 0/);
    assert.match(mentor, /recordAiWorkflowEvidence\(\{/);
    assert.match(mentor, /sources: researchProvider\.sources/);
    assert.match(trust, /privateMentorContextExcluded: true/);
    assert.match(trust, /receive no user history, profile, portfolio/);
    const researchPreparation = trust.slice(
      trust.indexOf("export function prepareMentorPublicResearchEgress"),
      trust.indexOf("export function prepareMentorEgress"),
    );
    assert.doesNotMatch(
      researchPreparation,
      /(?:mentorContext|approvedKnowledge|behavioralContext|recentConversation)\??\s*:/,
    );
  });
});
