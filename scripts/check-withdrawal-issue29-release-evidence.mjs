import { readFile } from "node:fs/promises";

const files = {
  report: "docs/launch/WITHDRAWAL_RELEASE_EVIDENCE_ISSUE_29_20260820.md",
  inventory: "docs/security/WITHDRAWAL_EXTERNAL_EFFECT_EVIDENCE_INVENTORY.md",
  walletGuard: "scripts/check-wallet-authority.mjs",
  externalEffectGuard: "scripts/check-withdrawal-external-effect-evidence.mjs",
  custodyGate: "scripts/check-wallet-custody-launch-gate.mjs",
  runtimeGuard: "scripts/check-withdrawal-runtime-authority.mjs",
  packageJson: "package.json",
  ciWorkflow: ".github/workflows/ci.yml",
};

const requireText = (failures, source, text, message) => {
  const normalizedSource = source.replace(/\s+/g, " ");
  const normalizedText = text.replace(/\s+/g, " ");
  if (!normalizedSource.includes(normalizedText)) failures.push(message);
};

const rejectText = (failures, source, pattern, message) => {
  if (pattern.test(source)) failures.push(message);
};

export function evaluateWithdrawalIssue29ReleaseEvidence(source) {
  const failures = [];
  const {
    report,
    inventory,
    walletGuard,
    externalEffectGuard,
    custodyGate,
    runtimeGuard,
    packageJson,
    ciWorkflow,
  } = source;

  for (const token of [
    "tecpey-withdrawal-release-evidence-v1",
    "Issue: #29",
    "CORE_AUTHORITY_REMEDIATED_REAL_MONEY_REMAINS_BLOCKED",
    "It does not close #29",
    "PostgreSQL-owned withdrawal authority",
    "persist-before-broadcast behavior",
    "ambiguous RPC recovery fixtures",
    "confirmation projection authority",
    "atomic settlement evidence",
    "does not prove production custody",
    "withdrawal:issue29:evidence:check",
    "Issue #29 remains open",
    "must not be interpreted as production custody approval",
    "This readiness record does not approve real-money withdrawals",
    "HSM/MPC readiness",
    "chain-provider certification",
    "final Go matrix",
  ]) {
    requireText(failures, report, token, `report is missing ${token}`);
  }

  for (const family of [
    "Concurrent duplicate broadcast",
    "Database loss after broadcast",
    "Ambiguous RPC and already-known handling",
    "Chain certification",
    "Testnet runtime evidence",
    "HSM/MPC custody",
    "Reconciliation",
    "DLQ/manual review",
    "Hot-wallet limits and dual control",
    "Staging Golden Path",
  ]) {
    requireText(failures, report, family, `report is missing evidence family ${family}`);
  }

  for (const token of [
    "does not by itself approve real-money custody",
    "Chain/provider certification and operational recovery evidence remain coordinated with #29",
    "confirmed ambiguity window",
    "ambiguous must reconcile before a new call or generation",
  ]) {
    requireText(failures, inventory, token, `inventory is missing ${token}`);
  }

  for (const token of [
    "allows only one PostgreSQL-authorized RPC submission across two Redis workers",
    "turns an expired calling lease into ambiguous reconciliation debt without a second attempt",
    "provider RPC fixture is missing",
    "does not by itself approve real-money custody",
  ]) {
    requireText(failures, externalEffectGuard, token, `external-effect guard is missing ${token}`);
  }

  for (const token of [
    "signed raw transaction must be persisted",
    "deterministic transaction hash must be persisted",
    "executor must not use queue-provided chain authority",
    "confirmation worker must not own direct withdrawal state mutation",
    "PostgreSQL owns preparation, broadcast attempts, confirmation outcomes and settlement",
  ]) {
    requireText(failures, walletGuard, token, `wallet authority guard is missing ${token}`);
  }

  for (const token of [
    "real_withdrawals_forbidden",
    "environment_private_keys_forbidden",
    "simulation_forbidden",
    "custody:check",
    "Wallet custody launch gate check passed",
  ]) {
    requireText(failures, custodyGate, token, `custody gate is missing ${token}`);
  }

  for (const token of [
    "ensureWithdrawalPriceSnapshot",
    "price_consensus_unavailable",
    "settleConfirmedWithdrawal",
    "state completion must share the settlement transaction",
    "settlement retry must be idempotent",
  ]) {
    requireText(failures, runtimeGuard, token, `runtime guard is missing ${token}`);
  }

  for (const token of [
    '"withdrawal:issue29:evidence:check": "node scripts/check-withdrawal-issue29-release-evidence.mjs"',
    '"test:withdrawal-issue29-evidence": "node --test scripts/withdrawal-issue29-release-evidence.test.mjs"',
    "npm run withdrawal:issue29:evidence:check",
    "npm run test:withdrawal-issue29-evidence",
  ]) {
    requireText(failures, packageJson, token, `package.json is missing ${token}`);
  }

  for (const token of [
    "Withdrawal issue #29 release evidence guard",
    "npm run withdrawal:issue29:evidence:check",
    "npm run test:withdrawal-issue29-evidence",
  ]) {
    requireText(failures, ciWorkflow, token, `CI workflow is missing ${token}`);
  }

  rejectText(
    failures,
    report,
    /Issue #29 (?:is )?closed|#29 closed|real-money withdrawals approved|custody approved|production signer approved|GO approved/i,
    "report must not claim issue closure, custody approval, real-money approval, signer approval, or GO",
  );

  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const source = Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
    ),
  );
  const failures = evaluateWithdrawalIssue29ReleaseEvidence(source);
  if (failures.length) {
    console.error("Withdrawal issue #29 release evidence check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Withdrawal issue #29 release evidence check passed.");
}
