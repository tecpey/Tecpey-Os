#!/usr/bin/env node
import fs from "node:fs";
import { assertSupportInstallReadiness } from "./support-install-readiness-policy.mjs";

const read = (path) => fs.readFileSync(path, "utf8");

assertSupportInstallReadiness({
  packageJson: read("package.json"),
  bundleCreator: read("scripts/create-support-deployment-bundle.sh"),
  bundleVerifier: read("scripts/verify-support-deployment-bundle.mjs"),
  rehearsal: read("scripts/rehearse-support-deployment-install.mjs"),
  readinessContract: read("docs/operations/SUPPORT_INSTALL_READINESS_CONTRACT.md"),
  handoff: read("docs/operations/SUPPORT_TEAM_DEPLOYMENT_HANDOFF.md"),
  workflow: read(".github/workflows/support-deployment-bundle.yml"),
});

console.log("Support install readiness authority check passed.");
