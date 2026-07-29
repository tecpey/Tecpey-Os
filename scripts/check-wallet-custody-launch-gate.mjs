import { readFile } from "node:fs/promises";

const failures = [];

async function source(path) {
  return readFile(path, "utf8");
}

const policy = await source("src/lib/wallet/custody-launch-policy.ts");
for (const [label, pattern] of [
  ["production readiness is false", /productionReady:\s*false/],
  ["raw key discovery", /configuredEnvironmentPrivateKeyNames/],
  ["production config assertion", /assertProductionCustodyConfiguration/],
  ["capability assertion", /assertCustodyCapability/],
  ["real withdrawal rejection", /real_withdrawals_forbidden/],
  ["raw key rejection", /environment_private_keys_forbidden/],
  ["simulation rejection", /simulation_forbidden/],
  ["chain allowlist", /TECPEY_CUSTODY_ENABLED_CHAINS/],
  ["kill switch", /TECPEY_CUSTODY_KILL_SWITCH/],
]) {
  if (!pattern.test(policy)) failures.push(`custody policy: missing ${label}`);
}

const keyStore = await source("src/lib/wallet/signing/keystore.ts");
if (!/assertCustodyCapability\("deposit_address_allocation"/.test(keyStore)) {
  failures.push("keystore: address derivation is not custody-gated");
}
if (!/assertCustodyCapability\("transaction_signing"/.test(keyStore)) {
  failures.push("keystore: signing is not custody-gated");
}
if (!/assertProductionCustodyConfiguration\(\)/.test(keyStore)) {
  failures.push("keystore: production configuration is not validated before selection");
}

const worker = await source("src/workers/withdrawal-worker.ts");
if (!/assertCustodyCapability\("withdrawal_worker"\)/.test(worker)) {
  failures.push("worker: startup is not custody-gated");
}

const executor = await source("src/lib/wallet/withdrawal-executor.ts");
const executionGate = executor.indexOf('assertCustodyCapability("withdrawal_worker")');
const claim = executor.indexOf("claimWithdrawal(job.withdrawalId)");
if (executionGate < 0 || claim < 0 || executionGate > claim) {
  failures.push("executor: custody gate must run before withdrawal claim");
}
if (!/assertCustodyCapability\("transaction_signing", \{ chainId: withdrawal\.network \}\)/.test(executor)) {
  failures.push("executor: signing capability is not bound to authoritative chain");
}
if (!/assertCustodyCapability\("transaction_broadcast", \{ chainId \}\)/.test(executor)) {
  failures.push("executor: broadcast capability is not bound to authoritative chain");
}

const server = await source("server.ts");
if (!/assertProductionCustodyConfiguration\(\)/.test(server)) {
  failures.push("server: production custody configuration is not checked at boot");
}
if (!/custodyStatus\.workerEnabled/.test(server)) {
  failures.push("server: worker import/start is not conditioned on safe custody status");
}

const admin = await source("src/lib/security/withdrawal-admin-authority.ts");
if (!/isCustodyCapabilityEnabled\("withdrawal_approval"\)/.test(admin)) {
  failures.push("admin withdrawal approval does not use shared custody policy");
}

const env = await source("scripts/validate-env.mjs");
for (const pattern of [
  /environment-backed wallet private keys are forbidden in production/i,
  /TECPEY_CUSTODY_SIMULATION_ENABLED=1 is forbidden in production/,
  /HSM\/MPC custody configuration is forbidden until an approved signer is implemented/,
  /TECPEY_CUSTODY_ENABLED_CHAINS contains unsupported chains/,
]) {
  if (!pattern.test(env)) failures.push(`env validator: missing ${pattern}`);
}

const statusRoute = await source("src/app/api/wallet/custody-status/route.ts");
if (!/productionReady:\s*status\.productionReady/.test(statusRoute)) {
  failures.push("custody status route does not expose truthful readiness");
}
if (/PRIVATE_KEY|HSM_KEY_ID|MPC_PARTY_ID/.test(statusRoute)) {
  failures.push("custody status route may not expose secret configuration names");
}

const packageJson = JSON.parse(await source("package.json"));
if (!packageJson.scripts?.["custody:check"]) {
  failures.push("package: custody:check is missing");
}
if (!packageJson.scripts?.["test:custody-gate"]) {
  failures.push("package: test:custody-gate is missing");
}
if (!packageJson.scripts?.["release:check"]?.includes("npm run custody:check")) {
  failures.push("package: release:check does not enforce custody guard");
}

if (failures.length) {
  console.error("Wallet custody launch gate check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Wallet custody launch gate check passed.");
