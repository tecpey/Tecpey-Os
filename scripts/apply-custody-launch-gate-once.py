from pathlib import Path
import json


def update(path: str, transform) -> None:
    file = Path(path)
    before = file.read_text()
    after = transform(before)
    if after == before:
        raise SystemExit(f"no deterministic change applied: {path}")
    file.write_text(after)


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"replacement marker missing: {label}")
    if source.count(old) != 1:
        raise SystemExit(f"replacement marker not unique: {label}")
    return source.replace(old, new, 1)


def patch_keystore(source: str) -> str:
    source = replace_once(
        source,
        'import type { ChainId, KeyStore, KeyStoreType } from "../types";',
        'import type { ChainId, KeyStore, KeyStoreType } from "../types";\nimport {\n  assertCustodyCapability,\n  assertProductionCustodyConfiguration,\n} from "../custody-launch-policy";',
        "keystore policy import",
    )
    source = replace_once(
        source,
        '  async getAddress(chainId: ChainId, index = 0): Promise<string> {\n    const privKey = getPrivateKey(chainId, index);',
        '  async getAddress(chainId: ChainId, index = 0): Promise<string> {\n    assertCustodyCapability("deposit_address_allocation", { chainId });\n    const privKey = getPrivateKey(chainId, index);',
        "hot wallet address gate",
    )
    source = replace_once(
        source,
        '  async getPublicKey(chainId: ChainId, index = 0): Promise<Buffer> {\n    const privKey = getPrivateKey(chainId, index);',
        '  async getPublicKey(chainId: ChainId, index = 0): Promise<Buffer> {\n    assertCustodyCapability("transaction_signing", { chainId });\n    const privKey = getPrivateKey(chainId, index);',
        "hot wallet public key gate",
    )
    source = replace_once(
        source,
        '  async sign(chainId: ChainId, signingHash: Buffer, index = 0): Promise<Buffer> {\n    const privKey = getPrivateKey(chainId, index);',
        '  async sign(chainId: ChainId, signingHash: Buffer, index = 0): Promise<Buffer> {\n    assertCustodyCapability("transaction_signing", { chainId });\n    const privKey = getPrivateKey(chainId, index);',
        "hot wallet signing gate",
    )
    source = replace_once(
        source,
        'export function createKeyStore(): KeyStore {\n  // HSM/MPC classes are intentionally not selectable until their implementations',
        'export function createKeyStore(): KeyStore {\n  assertProductionCustodyConfiguration();\n\n  // HSM/MPC classes are intentionally not selectable until their implementations',
        "keystore factory production config",
    )
    source = replace_once(
        source,
        '  if (process.env.NODE_ENV !== "production") return new SimulatedKeyStore();\n  throw new Error("No wallet keystore configured. Set WALLET_*_PRIVATE_KEY env vars.");',
        '  if (process.env.NODE_ENV !== "production") return new SimulatedKeyStore();\n  throw new Error("custody_keystore_unavailable:custody_not_production_ready");',
        "safe production factory error",
    )
    return source


def patch_worker(source: str) -> str:
    source = replace_once(
        source,
        'import { assertSupportedWalletKeyStoreConfig } from "@/lib/wallet/signing/runtime-guard";',
        'import { assertSupportedWalletKeyStoreConfig } from "@/lib/wallet/signing/runtime-guard";\nimport { assertCustodyCapability } from "@/lib/wallet/custody-launch-policy";',
        "worker custody import",
    )
    source = replace_once(
        source,
        '  assertSupportedWalletKeyStoreConfig();\n\n  const concurrency',
        '  assertSupportedWalletKeyStoreConfig();\n  assertCustodyCapability("withdrawal_worker");\n\n  const concurrency',
        "worker startup gate",
    )
    return source


def patch_executor(source: str) -> str:
    source = replace_once(
        source,
        'import { createKeyStore } from "./signing/keystore";',
        'import { createKeyStore } from "./signing/keystore";\nimport { assertCustodyCapability } from "./custody-launch-policy";',
        "executor custody import",
    )
    source = replace_once(
        source,
        'export async function executeWithdrawal(job: WithdrawalJobData): Promise<void> {\n  const plan = await claimWithdrawal(job.withdrawalId);',
        'export async function executeWithdrawal(job: WithdrawalJobData): Promise<void> {\n  // Gate before PostgreSQL claim so a disabled custody runtime cannot move an\n  // approved withdrawal into an execution state.\n  assertCustodyCapability("withdrawal_worker");\n  const plan = await claimWithdrawal(job.withdrawalId);',
        "executor pre-claim gate",
    )
    source = replace_once(
        source,
        '  const provider = getProvider(withdrawal.network);\n  const keyStore = createKeyStore();',
        '  assertCustodyCapability("transaction_signing", { chainId: withdrawal.network });\n  const provider = getProvider(withdrawal.network);\n  const keyStore = createKeyStore();',
        "executor signing gate",
    )
    source = replace_once(
        source,
        '): Promise<{ txHash: string; broadcastedAt: Date; attempts: number }> {\n  const { getRpcClient } = await import("./rpc/client");',
        '): Promise<{ txHash: string; broadcastedAt: Date; attempts: number }> {\n  assertCustodyCapability("transaction_broadcast", { chainId });\n  const { getRpcClient } = await import("./rpc/client");',
        "executor broadcast gate",
    )
    return source


def patch_server(source: str) -> str:
    source = replace_once(
        source,
        'import { bootstrapComplianceProviders } from "./src/lib/compliance/index";',
        'import { bootstrapComplianceProviders } from "./src/lib/compliance/index";\nimport {\n  assertProductionCustodyConfiguration,\n  getCustodyLaunchStatus,\n} from "./src/lib/wallet/custody-launch-policy";',
        "server custody import",
    )
    source = replace_once(
        source,
        '  bootstrapComplianceProviders();\n\n  const redisUrl = configuredRedisUrl();',
        '  bootstrapComplianceProviders();\n  assertProductionCustodyConfiguration();\n  const custodyStatus = getCustodyLaunchStatus();\n\n  const redisUrl = configuredRedisUrl();',
        "server boot validation",
    )
    source = replace_once(
        source,
        '  if (redisUrl) {\n    withdrawalWorkers = await import("./src/workers/withdrawal-worker");\n    withdrawalWorkers.startWithdrawalWorkers();\n  }',
        '  if (redisUrl && custodyStatus.workerEnabled) {\n    withdrawalWorkers = await import("./src/workers/withdrawal-worker");\n    withdrawalWorkers.startWithdrawalWorkers();\n  } else if (redisUrl) {\n    console.warn(\n      "> Custody disabled — withdrawal execution, signing and broadcast workers were not started",\n    );\n  }',
        "server worker conditional",
    )
    return source


def patch_admin(source: str) -> str:
    source = replace_once(
        source,
        'import { PLATFORM } from "@/lib/platform-config";',
        'import { PLATFORM } from "@/lib/platform-config";\nimport { isCustodyCapabilityEnabled } from "@/lib/wallet/custody-launch-policy";',
        "admin custody import",
    )
    source = replace_once(
        source,
        '        if (process.env.TECPEY_REAL_WITHDRAWALS_ENABLED !== "1") {',
        '        if (!isCustodyCapabilityEnabled("withdrawal_approval")) {',
        "admin approval gate",
    )
    return source


def patch_validate_env(source: str) -> str:
    source = replace_once(
        source,
        "  'TECPEY_REAL_WITHDRAWALS_ENABLED',\n",
        "  'TECPEY_REAL_WITHDRAWALS_ENABLED',\n  'TECPEY_CUSTODY_ENABLED_CHAINS',\n  'TECPEY_CUSTODY_KILL_SWITCH',\n  'TECPEY_CUSTODY_SIMULATION_ENABLED',\n",
        "env optional custody variables",
    )
    marker = "if (process.env.NODE_ENV === 'production') {\n"
    block = """if (process.env.NODE_ENV === 'production') {
  const walletPrivateKeyNames = Object.keys(process.env).filter(
    (name) => /^WALLET_[A-Z0-9_]+_PRIVATE_KEY(?:_\\d+)?$/.test(name) && Boolean(process.env[name]?.trim()),
  );
  if (walletPrivateKeyNames.length > 0) {
    errors.push(
      'Environment-backed wallet private keys are forbidden in production; custody must remain disabled until an approved non-exportable signer is implemented.'
    );
  }
  if (process.env.TECPEY_CUSTODY_SIMULATION_ENABLED === '1') {
    errors.push('TECPEY_CUSTODY_SIMULATION_ENABLED=1 is forbidden in production');
  }
  if (
    process.env.HSM_ENDPOINT?.trim() ||
    process.env.HSM_KEY_ID?.trim() ||
    process.env.MPC_ENDPOINT?.trim() ||
    process.env.MPC_PARTY_ID?.trim()
  ) {
    errors.push(
      'HSM/MPC custody configuration is forbidden until an approved signer is implemented and verified.'
    );
  }

  const supportedCustodyChains = new Set([
    'bitcoin', 'ethereum', 'bsc', 'polygon', 'tron', 'solana',
  ]);
  const invalidCustodyChains = (process.env.TECPEY_CUSTODY_ENABLED_CHAINS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .filter((value) => !supportedCustodyChains.has(value));
  if (invalidCustodyChains.length > 0) {
    errors.push('TECPEY_CUSTODY_ENABLED_CHAINS contains unsupported chains');
  }
"""
    if source.count(marker) != 1:
        raise SystemExit("production env block marker missing or ambiguous")
    source = source.replace(marker, block, 1)
    return source


def patch_package(source: str) -> str:
    package = json.loads(source)
    scripts = package["scripts"]
    scripts["custody:check"] = "node scripts/check-wallet-custody-launch-gate.mjs"
    scripts["test:custody-gate"] = (
        "NODE_ENV=test node --import tsx --test --test-force-exit "
        "src/tests/wallet/custody-launch-policy.test.ts "
        "src/tests/wallet/keystore-runtime-guard.test.ts"
    )
    release = scripts["release:check"]
    needle = "npm run withdrawals:check && npm run test:withdrawal-admission"
    replacement = (
        "npm run custody:check && npm run test:custody-gate && "
        "npm run withdrawals:check && npm run test:withdrawal-admission"
    )
    if replacement not in release:
        if needle not in release:
            raise SystemExit("release custody insertion point missing")
        scripts["release:check"] = release.replace(needle, replacement, 1)
    return json.dumps(package, indent=2, ensure_ascii=False) + "\n"


update("src/lib/wallet/signing/keystore.ts", patch_keystore)
update("src/workers/withdrawal-worker.ts", patch_worker)
update("src/lib/wallet/withdrawal-executor.ts", patch_executor)
update("server.ts", patch_server)
update("src/lib/security/withdrawal-admin-authority.ts", patch_admin)
update("scripts/validate-env.mjs", patch_validate_env)
update("package.json", patch_package)

print("Applied custody launch gate to production runtime boundaries.")
