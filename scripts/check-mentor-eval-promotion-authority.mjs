import { readFile } from "node:fs/promises";

const failures = [];
const source = async (path) => readFile(path, "utf8");
const requireText = (label, body, needle, message) => {
  if (!body.includes(needle)) failures.push(`${label}: ${message}`);
};
const requirePattern = (label, body, pattern, message) => {
  if (!pattern.test(body)) failures.push(`${label}: ${message}`);
};

const migration = await source("src/lib/db-migrate-mentor-eval-promotion-authority.ts");
for (const needle of [
  "0106_mentor_eval_promotion_authority.sql",
  "ai_mentor_eval_runs",
  "ai_mentor_eval_metric_results",
  "candidate_sha",
  "candidate_tree",
  "prompt_hash",
  "dataset_hash",
  "evidence_hash",
  "baseline_run_id",
  "release_decision",
  "hard_gate_failure_count",
  "ENABLE ROW LEVEL SECURITY",
  "FORCE ROW LEVEL SECURITY",
  "tecpey_ai_authorized_context",
  "ai_mentor_eval_runs_no_update",
  "ai_mentor_eval_runs_no_delete",
  "ai_mentor_eval_metric_results_no_update",
  "ai_mentor_eval_metric_results_no_delete",
]) {
  requireText("migration", migration, needle, `missing immutable promotion invariant: ${needle}`);
}
requirePattern(
  "migration",
  migration,
  /FOREIGN KEY \(tenant_id, workspace_id, baseline_run_id\)[\s\S]*REFERENCES ai_mentor_eval_runs\(tenant_id, workspace_id, id\)/,
  "baseline evidence must stay inside the exact tenant/workspace scope",
);
requirePattern(
  "migration",
  migration,
  /GRANT SELECT, INSERT ON TABLE ai_mentor_eval_runs, ai_mentor_eval_metric_results[\s\S]*tecpey_ai_tenant_runtime/,
  "tenant runtime must have only append/read evidence authority",
);

const store = await source("src/lib/ai/mentor-eval-store.ts");
for (const needle of [
  "withAiTenantTransaction",
  "MENTOR_EVAL_CONTRACT_VERSION",
  "MENTOR_EVIDENCE_POLICY_VERSION",
  "mentorEvalReleaseDecision",
  "candidateSha",
  "candidateTree",
  "promptHash",
  "datasetHash",
  "baselineRunId",
  "mentor_eval_baseline_run_required",
  "hardGateFailureCount",
  "evidenceHash",
]) {
  requireText("store", store, needle, `missing evidence binding: ${needle}`);
}
for (const forbidden of [
  "conversationContent",
  "rawConversation",
  "rawPrompt",
  "portfolio",
  "kyc",
  "privateKey",
  "seedPhrase",
]) {
  if (store.includes(forbidden)) {
    failures.push(`store: raw/private eval evidence surface is forbidden: ${forbidden}`);
  }
}

const registry = await source("src/lib/db-migration-registry.ts");
requireText(
  "registry",
  registry,
  "migration-step-090",
  "Mentor eval promotion migration must be part of the canonical migration ledger",
);
requireText(
  "registry",
  registry,
  "runMentorEvalPromotionAuthorityMigrations",
  "Mentor eval promotion migration runner must be governed",
);

const tenantRegistry = await source("docs/security/tenant-scoped-table-registry.json");
for (const table of ["ai_mentor_eval_runs", "ai_mentor_eval_metric_results"]) {
  requireText(
    "tenant-registry",
    tenantRegistry,
    `"table": "${table}"`,
    `tenant table registry missing ${table}`,
  );
}

const packageJson = JSON.parse(await source("package.json"));
const scripts = packageJson.scripts ?? {};
if (!scripts["mentor:evals:authority:check"]) {
  failures.push("package: mentor:evals:authority:check is missing");
}
if (!scripts["test:mentor-eval-promotion"]) {
  failures.push("package: test:mentor-eval-promotion is missing");
}
if (!scripts["ai:trust:check"]?.includes("mentor:evals:authority:check")) {
  failures.push("package: ai:trust:check must enforce Mentor eval promotion authority");
}
if (!scripts["ai:redteam:check"]?.includes("test:mentor-eval-promotion")) {
  failures.push("package: ai:redteam:check must run Mentor promotion decision tests");
}

const docs = await source("docs/mentor/MENTOR_EVAL_PROMOTION_AUTHORITY_V1.md");
for (const needle of [
  "exact candidate Git commit and tree",
  "No raw production conversation",
  "Missing metrics fail closed",
  "Evidence is append-only",
  "real trading",
]) {
  requireText("docs", docs, needle, `operational contract missing: ${needle}`);
}

if (failures.length) {
  console.error("Mentor eval promotion authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Mentor eval promotion authority check passed.");
