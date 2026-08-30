import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

const source = (path: string) => readFile(path, "utf8");

async function productionTypeScriptSources(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "tests") continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await productionTypeScriptSources(path));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

describe("managed AI launch containment source authority", () => {
  it("has no deployment override and keeps the exception exact", async () => {
    const policy = await source("src/lib/ai/managed-ai-launch-policy.ts");
    assert.doesNotMatch(policy, /process\.env/);
    assert.match(policy, /overrideAllowed: false/);
    assert.match(policy, /configurationSource === exception\.configurationSource/);
    assert.match(policy, /input\.agentId === exception\.agentId/);
    assert.match(policy, /input\.tenantId === exception\.tenantId/);
    assert.match(policy, /input\.workspaceId === exception\.workspaceId/);
  });

  it("gates managed activation, resolution, admission, egress and knowledge before use", async () => {
    const [store, route, mentor] = await Promise.all([
      source("src/lib/ai/control-plane-store.ts"),
      source("src/app/api/command-center/ai-control-plane/route.ts"),
      source("src/app/api/ai-mentor/route.ts"),
    ]);
    assert.match(store, /input\.enabled && !managedAiLaunchStatus\(\)\.ready/g);
    assert.match(store, /input\.candidates\.some\(\(candidate\) => candidate\.enabled\)/);
    assert.match(store, /configurationSource: "managed"[\s\S]*status: launch\.reason/);
    assert.match(store, /export async function admitAiAgentExecution[\s\S]*evaluateAiLaunchPolicy\(input\)/);
    assert.match(store, /export async function markAiAgentSpendEgress[\s\S]*evaluateAiLaunchPolicy\(input\)/);
    const admission = store.slice(
      store.indexOf("export async function admitAiAgentExecution"),
      store.indexOf("export async function updateAiProvider"),
    );
    assert.match(admission, /advisoryLock\(client, aiAgentAdvisoryScope\(input\)\)[\s\S]*hasNoManagedAiAgentBinding\(client, input\)[\s\S]*reserveAiAgentSpendWithClient\(client, input\)/);
    const egressMark = store.slice(
      store.indexOf("export async function markAiAgentSpendEgress"),
      store.indexOf("function normalizeAiSpendSettlementInput"),
    );
    assert.match(egressMark, /advisoryLock\(client, aiAgentAdvisoryScope\(input\)\)[\s\S]*hasNoManagedAiAgentBinding\(client, input\)[\s\S]*advisoryLock\(client, aiSpendAdvisoryScope\(input\)\)/);
    assert.match(store, /A disabled binding is[\s\S]*closes the environment exception/);
    assert.match(store, /export async function loadVerifiedAiKnowledgeContext[\s\S]*AI_TENANT_ISOLATION_BLOCK_REASON/);
    assert.match(store, /input\.decision === "verified" && !managedAiLaunchStatus\(\)\.ready/);
    assert.match(route, /if \(!managedAiLaunchStatus\(\)\.ready\) return tenantIsolationError\(\);[\s\S]*resolveAiProviderForTest/);
    assert.match(route, /ai_tenant_isolation_unresolved/);
    assert.match(mentor, /configurationSource: researchConfig\.configurationSource/);
    assert.match(mentor, /configurationSource: providerConfig\.configurationSource/);
    assert.match(mentor, /verifiedKnowledgeStatus/);
    assert.match(mentor, /const externalManagedPathRequested =[\s\S]*externalProviderAuthorized[\s\S]*!lowCostPattern\.test\(question\)[\s\S]*const runtimeAgent = externalManagedPathRequested/);
    assert.match(mentor, /runtimeAgent\?\.status === "tenant_isolation_unresolved"[\s\S]*return tenantIsolationError\(\)/);
  });

  it("forbids production callers from bypassing launch admission with a direct spend reserve", async () => {
    const files = [
      ...await productionTypeScriptSources("src"),
      ...await productionTypeScriptSources("scripts"),
    ];
    const callers: string[] = [];
    for (const file of files) {
      const contents = await source(file);
      const matches = contents.match(/\breserveAiAgentSpend\s*\(/g) ?? [];
      const allowedDeclarations = file === "src/lib/ai/control-plane-store.ts" ? 1 : 0;
      if (matches.length !== allowedDeclarations) callers.push(file);
    }
    assert.deepEqual(callers, []);
  });

  it("releases every unmarked reservation after a production egress-mark failure", async () => {
    const files = [
      ...await productionTypeScriptSources("src"),
      ...await productionTypeScriptSources("scripts"),
    ];
    const unsafeCallers: string[] = [];
    for (const file of files) {
      if (file === "src/lib/ai/control-plane-store.ts") continue;
      const contents = await source(file);
      const marks = contents.match(/\bmarkAiAgentSpendEgress\s*\(/g) ?? [];
      const releases = contents.match(/\breleaseUnmarkedAiAgentSpend\s*\(/g) ?? [];
      if (marks.length !== releases.length) unsafeCallers.push(file);
    }
    assert.deepEqual(unsafeCallers, []);

    const store = await source("src/lib/ai/control-plane-store.ts");
    const cleanup = store.slice(
      store.indexOf("export async function releaseUnmarkedAiAgentSpend"),
      store.indexOf("export async function loadVerifiedAiKnowledgeContext"),
    );
    assert.match(cleanup, /settleAiAgentSpend\([\s\S]*accountedCostUsdMicros: 0[\s\S]*egressAttemptId: null/);
  });

  it("blocks automation intake and claims while preserving rejection, recovery and finalization", async () => {
    const [store, worker, internalExecutor, route, panel] = await Promise.all([
      source("src/lib/ai/automation-store.ts"),
      source("src/lib/ai/automation-worker.ts"),
      source("scripts/run-ai-automation-internal-executor.ts"),
      source("src/app/api/command-center/ai-automation/route.ts"),
      source("src/components/admin/AiAutomationPanel.tsx"),
    ]);
    assert.match(store, /input\.enabled && !managedAiLaunchStatus\(\)\.ready/);
    assert.match(store, /export async function enqueueAiAutomationRun[\s\S]*!managedAiLaunchStatus\(\)\.ready/);
    assert.match(store, /export async function claimAiAutomationReviewRun[\s\S]*!managedAiLaunchStatus\(\)\.ready/);
    assert.match(store, /input\.decision === "approve"[\s\S]*!managedAiLaunchStatus\(\)\.ready/);
    const finalize = store.slice(store.indexOf("export async function finalizeAiAutomationExecution"));
    assert.doesNotMatch(finalize, /managedAiLaunchStatus/);
    assert.match(store, /export async function recoverExpiredAiAutomationRuns/);
    assert.match(worker, /const recovered = await recoverExpiredAiAutomationRuns\(\);[\s\S]*status: "blocked"[\s\S]*enqueued: 0/);
    assert.match(internalExecutor, /ai_automation_tenant_isolation_unresolved/);
    assert.match(route, /tenantIsolationError\(\)/);
    assert.match(panel, /!snapshot\.managedLaunch\.ready/);
    assert.match(panel, /review\(run, "reject"\)/);
    assert.match(panel, /همهٔ رأی‌های approve/);
    assert.match(panel, /ذخیره‌شده · مسدود/);
  });
});
