import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { validateRepositoryHygieneCandidateRegistry } from "./repository-hygiene-candidate-policy.mjs";

const root = process.cwd();
const registry = JSON.parse(
  fs.readFileSync(
    path.join(root, "config", "repository-hygiene-candidate-ownership.json"),
    "utf8",
  ),
);
const hygiene = JSON.parse(
  execFileSync(process.execPath, ["scripts/audit-repository-hygiene.mjs", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  }),
);
const findings = validateRepositoryHygieneCandidateRegistry(registry, {
  orphanCandidates: hygiene.orphanCandidates,
  readFile: (repositoryPath) => fs.readFileSync(path.join(root, repositoryPath)),
});

if (findings.length > 0) {
  throw new Error(`Repository hygiene candidate ownership failed:\n- ${findings.join("\n- ")}`);
}

const counts = Object.fromEntries(
  [...new Set(registry.candidates.map((candidate) => candidate.classification))]
    .sort()
    .map((classification) => [
      classification,
      registry.candidates.filter((candidate) => candidate.classification === classification).length,
    ]),
);
console.log(
  `Repository hygiene ownership: ${registry.candidates.length} candidates classified, ${JSON.stringify(counts)}, 0 deletions authorized`,
);
