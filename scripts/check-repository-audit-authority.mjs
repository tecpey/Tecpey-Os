import fs from "node:fs";
import path from "node:path";
import { assertRepositoryAuditWorkflow } from "./repository-audit-workflow-policy.mjs";

const root = process.cwd();
const workflowPath = path.join(root, ".github", "workflows", "repository-audit-manifest.yml");
const workflowSource = fs.readFileSync(workflowPath, "utf8");
assertRepositoryAuditWorkflow(workflowSource);

const hygieneSource = fs.readFileSync(
  path.join(root, "scripts", "audit-repository-hygiene.mjs"),
  "utf8",
);
if (!hygieneSource.includes('  "artifacts",')) {
  throw new Error("Repository hygiene must exclude generated audit artifacts from its working-tree inventory");
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const requiredScripts = {
  "audit:manifest": "node scripts/generate-repository-audit-manifest.mjs",
  "audit:manifest:check": "node scripts/check-repository-audit-authority.mjs",
  "audit:manifest:verify": "node scripts/verify-repository-audit-manifest.mjs",
  "test:audit-manifest":
    "node --test scripts/repository-audit-manifest.test.mjs scripts/repository-audit-workflow-policy.test.mjs",
};
for (const [name, command] of Object.entries(requiredScripts)) {
  if (packageJson.scripts?.[name] !== command) {
    throw new Error(`package.json script ${name} must be exactly: ${command}`);
  }
}

console.log("Repository audit authority: exact-head workflow and package commands verified");
