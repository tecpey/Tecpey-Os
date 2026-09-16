import fs from "node:fs";
const source = fs.readFileSync("docs/operations/PROTECTED_INCIDENT_ENV_PARSER_FIX_2026-09-16.md", "utf8");
for (const invariant of ["protected_incident_environment_file_format_invalid", "optional `export`", "duplicate keys", "X.509 validation", "No staging environment file"]) {
  if (!source.includes(invariant)) throw new Error(`parser fix documentation missing: ${invariant}`);
}
console.log("protected incident env parser documentation authority: ok");
