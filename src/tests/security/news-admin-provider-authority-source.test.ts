import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("news admin provider authority source contract", () => {
  const store = source("src/lib/ai/control-plane-store.ts");
  const worker = source("scripts/run-news-enrichment-worker.ts");
  const translation = source("src/lib/news-translation.ts");
  const managedPolicy = source("src/lib/ai/managed-ai-launch-policy.ts");
  const controlPlaneRoute = source(
    "src/app/api/command-center/ai-control-plane/route.ts",
  );
  const automation = source("src/lib/ai/automation-worker.ts");

  it("keeps News activation independent from Managed-AI launch readiness", () => {
    assert.match(
      worker,
      /const aiEnabled = process\.env\.NEWS_AI_ENABLED\?\.trim\(\) === "1"/,
    );
    assert.match(
      worker,
      /if \(!aiEnabled\)[\s\S]*status: "ai_disabled"[\s\S]*aiCalls: 0/,
    );
    assert.match(
      worker,
      /NEWS_PROVIDER_SECRET_SOURCE \?\? "environment"/,
    );

    const resolverStart = store.indexOf(
      "export async function resolveAiProviderSecretForNewsTranslation",
    );
    const resolverEnd = store.indexOf(
      "export async function resolveAiProviderForTest",
      resolverStart,
    );

    assert.ok(resolverStart >= 0);
    assert.ok(resolverEnd > resolverStart);

    const resolver = store.slice(resolverStart, resolverEnd);
    assert.doesNotMatch(resolver, /managedAiLaunchStatus/);
    assert.doesNotMatch(resolver, /evaluateAiLaunchPolicy/);
  });

  it("keeps Managed-AI provider test and automation paths gated", () => {
    assert.match(
      controlPlaneRoute,
      /if \(!managedAiLaunchStatus\(\)\.ready\) return tenantIsolationError\(\)/,
    );
    assert.match(
      automation,
      /const launch = managedAiLaunchStatus\(\);[\s\S]*if \(!launch\.ready\)/,
    );
    assert.match(
      managedPolicy,
      /signed_rls_runtime_evidence_pending/,
    );
  });

  it("injects the purpose-bound provider config without exposing it in results", () => {
    assert.match(
      translation,
      /providerConfig\?: NewsTranslationProviderConfig/,
    );
    assert.match(
      translation,
      /const config = dependencies\.providerConfig \?\? routeConfig\(\)/,
    );
    assert.match(
      worker,
      /providerConfig: provider/,
    );

    assert.doesNotMatch(worker, /console\.log\([^)]*apiKey/);
    assert.doesNotMatch(worker, /JSON\.stringify\([^)]*apiKey/);
  });

  it("limits the control-plane News authority to OpenAI only", () => {
    const resolverStart = store.indexOf(
      "export async function resolveAiProviderSecretForNewsTranslation",
    );
    const resolverEnd = store.indexOf(
      "export async function resolveAiProviderForTest",
      resolverStart,
    );
    const resolver = store.slice(resolverStart, resolverEnd);

    assert.match(resolver, /providerId: "openai"/);
    assert.doesNotMatch(resolver, /"openai" \| "anthropic"/);
    assert.match(
      worker,
      /if \(provider !== "openai"\)[\s\S]*news_enrichment_control_plane_provider_not_allowed/,
    );
  });

  it("uses only the default tenant/workspace for the News control-plane lookup", () => {
    assert.match(
      worker,
      /tenantId: PLATFORM\.DEFAULT_TENANT_ID/,
    );
    assert.match(
      worker,
      /workspaceId: PLATFORM\.DEFAULT_WORKSPACE_ID/,
    );
  });
});
