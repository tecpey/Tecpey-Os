import fs from "node:fs";

const workflowPath = ".github/workflows/protected-staging-incident-readiness-evidence.yml";
const source = fs.readFileSync(workflowPath, "utf8");

const required = [
  "const parseValue = (rawValue) => {",
  "^(?:export\\s+)?([A-Z][A-Z0-9_]*)\\s*=\\s*(.*)$",
  "values.has(match[1])",
  "protected_incident_environment_file_format_invalid",
  "environmentStat.isSymbolicLink()",
  "(environmentStat.mode & 0o022) !== 0",
  "new X509Certificate(certificate)",
];
for (const invariant of required) {
  if (!source.includes(invariant)) throw new Error(`missing protected incident env parser invariant: ${invariant}`);
}

for (const forbidden of [
  "source $ENV_FILE",
  "source \"$ENV_FILE\"",
  "eval ",
  "set -x",
]) {
  if (source.includes(forbidden)) throw new Error(`unsafe protected incident env parser behavior: ${forbidden}`);
}

console.log("protected incident env parser authority: ok");
