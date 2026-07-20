import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const files = {
  core: "src/lib/wallet/custody-policy-core.mjs",
  policy: "src/lib/wallet/custody-policy.ts",
  keystore: "src/lib/wallet/signing/keystore.ts",
  runtimeGuard: "src/lib/wallet/signing/runtime-guard.ts",
  server: "server.ts",
  worker: "src/workers/withdrawal-worker.ts",
  processor: "src/lib/wallet/queue/processor.ts",
  queue: "src/lib/wallet/queue/withdrawal-queue.ts",
  executor: "src/lib/wallet/withdrawal-executor.ts",
  admin: "src/lib/security/withdrawal-admin-authority.ts",
  compliance: "src/lib/security/withdrawal-compliance-authority.ts",
  route: "src/app/api/auth/withdraw/route.ts",
  env: "scripts/validate-env.mjs",
  tests: "src/tests/wallet/custody-policy.test.ts",
  workflow: ".github/workflows/custody-release-gate.yml",
  docs: "docs/security/CUSTODY_RELEASE_GATE.md",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);
const failures = [];
const requireText = (target, text, reason) => {
  if (!content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

requireText("core", "production_environment_private_keys_forbidden", "production raw keys must fail boot");
requireText("core", "real_withdrawals_require_approved_custody", "legacy enable flags must not bypass custody");
requireText("core", "withdrawal_workers_require_approved_custody", "workers require approved custody");
requireText("core", "address_allocation_requires_approved_custody", "address allocation requires approved custody");
requireText("core", "hsm_signer_not_implemented", "HSM stubs must fail closed");
requireText("core", "mpc_signer_not_implemented", "MPC stubs must fail closed");
requireText("core", "custody_chain_limit_required", "every enabled chain needs a treasury limit");
requireText("core", "production_custody_requires_dual_control", "production policy must require dual control");
requireText("policy", "assertCustodyWithdrawalAllowed", "runtime must expose amount and chain enforcement");
requireText("policy", "custody_approval_quorum_incomplete", "runtime must enforce approval quorum");
requireText("policy", "custody_withdrawal_limit_exceeded", "runtime must enforce decimal withdrawal limits");
requireText("keystore", "isEnvironmentKeySignerAllowed", "environment keys must be policy-gated");
requireText("keystore", "isSimulationSignerAllowed", "simulation must be policy-gated");
requireText("keystore", "custody_launch_gate_disabled", "factory must have an explicit disabled outcome");
rejectText("keystore", 'if (process.env.NODE_ENV !== "production") return new SimulatedKeyStore()', "production fallback must not reach simulation");

const bootIndex = content.server.indexOf("assertCustodyBootSafe");
const workerImportIndex = content.server.indexOf('withdrawalWorkers = await import("./src/workers/withdrawal-worker")');
if (bootIndex < 0 || workerImportIndex < 0 || bootIndex > workerImportIndex) {
  failures.push("server.ts: custody boot validation must run before the withdrawal worker graph is imported");
}
requireText("server", "custody.workersEnabled", "worker import must depend on custody readiness");
requireText("worker", "assertCustodyWorkerStartupAllowed", "worker entry point must independently fail closed");
requireText("processor", "assertCustodyWorkerStartupAllowed", "execution and recovery constructors must be gated");
requireText("processor", "assertCustodyObservationAllowed", "confirmation constructor must require approved custody");
requireText("queue", "assertCustodyExecutionEnvironmentAllowed", "execution and recovery enqueue paths must be gated");
requireText("queue", "assertCustodyObservationAllowed", "confirmation enqueue path must be gated");
requireText("executor", "assertCustodyExecutionEnvironmentAllowed", "executor must gate before claiming PostgreSQL state");
requireText("executor", "assertCustodyWithdrawalAllowed", "executor must recheck authoritative chain and amount");
requireText("executor", 'amount_usd::text AS "amountUsd"', "executor must hydrate authoritative USD amount");
const executionGateIndex = content.executor.indexOf("assertCustodyExecutionEnvironmentAllowed");
const claimIndex = content.executor.indexOf("const plan = await claimWithdrawal");
if (executionGateIndex < 0 || claimIndex < 0 || executionGateIndex > claimIndex) {
  failures.push("src/lib/wallet/withdrawal-executor.ts: custody gate must run before claimWithdrawal");
}

requireText("admin", "assertCustodyWithdrawalAllowed", "admin approval must use central custody authority");
rejectText("admin", "TECPEY_REAL_WITHDRAWALS_ENABLED", "admin approval may not trust a standalone env flag");
requireText("compliance", "getCustodyRuntimeStatus", "compliance evidence must reference central custody authority");
rejectText("compliance", "TECPEY_REAL_WITHDRAWALS_ENABLED", "compliance may not trust a standalone env flag");
requireText("route", "getPublicCustodyStatus", "withdrawal API must expose truthful custody capability");
requireText("route", "custody_unavailable", "new requests must fail before reserving funds while custody is disabled");
requireText("env", "evaluateCustodyEnvironment", "release validation must use the same custody policy core");
requireText("tests", "production_environment_private_keys_forbidden", "production raw-key denial needs regression coverage");
requireText("tests", "custody_withdrawal_limit_exceeded", "treasury limits need regression coverage");
requireText("workflow", "permissions:\n  contents: read", "permanent gate must be read-only");
requireText("docs", "NOT READY", "readiness report must state the current real-custody posture");

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(full));
    else output.push(full);
  }
  return output;
}

for (const file of await walk("src/app/api")) {
  if (!file.endsWith("route.ts")) continue;
  const source = await readFile(file, "utf8");
  if (
    source.includes("signing/keystore") ||
    /\bcreateKeyStore\s*\(/.test(source) ||
    /\.getAddress\s*\(/.test(source)
  ) {
    failures.push(`${file}: public API routes may not allocate or sign through a keystore`);
  }
}

for (const temporary of [
  ".github/workflows/custody-source-snapshot-temp.yml",
  ".github/workflows/custody-remediation-once.yml",
]) {
  try {
    await readFile(temporary, "utf8");
    failures.push(`${temporary}: temporary custody asset remains in the final tree`);
  } catch {
    // Expected: temporary assets must be absent.
  }
}

if (failures.length) {
  console.error("Custody release gate check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Custody release gate check passed: production env keys, simulation, stubs, workers, queues, executor, admin approval and public APIs all fail closed behind one central policy.",
);
