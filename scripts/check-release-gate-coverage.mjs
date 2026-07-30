// Release gate coverage authority.
//
// `release:check` is the aggregate release gate, but it is not itself invoked by
// any workflow — CI runs its constituent gates individually. That is a valid
// arrangement only while every constituent is actually wired somewhere. It was
// not: 18 of 44 steps ran in no workflow at all, and two of them
// (`custody:check`, `bounded-body:check`) had silently rotted against refactored
// code because nothing executed them.
//
// This guard makes the arrangement self-enforcing: a gate added to
// `release:check` must be reachable from a workflow, or CI fails here.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const WORKFLOW_DIR = ".github/workflows";
const failures = [];

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const scripts = packageJson.scripts ?? {};

const releaseCheck = scripts["release:check"];
if (!releaseCheck) {
  console.error("Release gate coverage check failed:");
  console.error("- package.json is missing the release:check script");
  process.exit(1);
}

const workflowFiles = (await readdir(WORKFLOW_DIR)).filter((file) =>
  file.endsWith(".yml") || file.endsWith(".yaml"),
);
const workflowText = (
  await Promise.all(
    workflowFiles.map((file) => readFile(path.join(WORKFLOW_DIR, file), "utf8")),
  )
).join("\n");

const workflowNpmScripts = new Set(
  [...workflowText.matchAll(/npm run ([a-z0-9:_-]+)/g)].map((match) => match[1]),
);

function steps(command) {
  return command
    .split("&&")
    .map((part) => part.trim())
    .filter(Boolean);
}

// A leaf command is covered when the thing it actually executes appears in a
// workflow: a script path for `node scripts/x.mjs`, or the binary name for a
// direct tool invocation such as `eslint` or `tsc` (CI calls these through
// ./node_modules/.bin, so the npm script name never appears).
function leafIsCovered(command) {
  const scriptPath = /(?:^|\s)((?:scripts|src)\/[\w./-]+\.(?:mjs|ts|js))/.exec(command);
  if (scriptPath) return workflowText.includes(scriptPath[1]);

  const tokens = command.split(/\s+/).filter(Boolean);
  const binary = tokens.find(
    (token) => !["npx", "node", "NODE_ENV=test", "NODE_ENV=production"].includes(token) &&
      !token.includes("="),
  );
  if (!binary) return false;
  return new RegExp(`(?:/|\\s)${binary}\\b`).test(workflowText);
}

function isCovered(step, seen = new Set()) {
  const name = step.replace(/^npm run /, "").trim();

  if (workflowNpmScripts.has(name)) return true;
  if (seen.has(name)) return false;
  seen.add(name);

  const definition = scripts[name];
  if (!definition) return leafIsCovered(step);

  // Covered transitively when every part of the composite gate is covered.
  return steps(definition).every((part) =>
    part.startsWith("npm run") ? isCovered(part, seen) : leafIsCovered(part),
  );
}

const releaseSteps = steps(releaseCheck);
if (releaseSteps.length < 40) {
  failures.push(
    `release:check shrank to ${releaseSteps.length} steps — gates may have been dropped rather than wired`,
  );
}

for (const step of releaseSteps) {
  if (!isCovered(step)) {
    failures.push(
      `${step.replace(/^npm run /, "")}: declared in release:check but runs in no workflow`,
    );
  }
}

if (!workflowNpmScripts.has("custody:check")) {
  failures.push("custody:check must run in CI — it is the real-money custody gate");
}
if (!workflowNpmScripts.has("bounded-body:check")) {
  failures.push("bounded-body:check must run in CI — it bounds request body memory");
}

if (failures.length) {
  console.error("Release gate coverage check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Release gate coverage check passed: all ${releaseSteps.length} release:check gates are reachable from ${workflowFiles.length} workflows.`,
);
