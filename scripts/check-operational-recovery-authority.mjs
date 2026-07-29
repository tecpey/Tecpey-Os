import { readFile } from "node:fs/promises";
import { evaluateOperationalRecoveryAuthority } from "./operational-recovery-authority-policy.mjs";

const files = {
  workflow: ".github/workflows/operational-recovery.yml",
  recovery: "scripts/test-container-volume-recovery.sh",
  verifier: "scripts/verify-operational-recovery-evidence.mjs",
  runbook: "docs/operations/OPERATIONAL_RECOVERY_DRILLS.md",
  packageJson: "package.json",
  containerWorkflow: ".github/workflows/container-supply-chain.yml",
};
const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);
const failures = evaluateOperationalRecoveryAuthority(source);
if (failures.length) {
  console.error("Operational recovery authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Operational recovery authority check passed.");
