import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--manifest="))?.slice("--manifest=".length)
    ?? "docs/security/generated/api-security-manifest.json",
);
const outputPath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length)
    ?? "config/api-security-exceptions.json",
);
const expiresOn = process.argv.find((arg) => arg.startsWith("--expires-on="))?.slice("--expires-on=".length)
  ?? "2026-08-31";

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const exceptions = [];
for (const entry of manifest.routes) {
  for (const finding of entry.findings) {
    const domain = entry.domainOwner || "platform";
    exceptions.push({
      id: slug(`${entry.method}-${entry.route}-${finding}`),
      route: entry.route,
      method: entry.method,
      finding,
      owner: `${domain}-domain`,
      issue: "#108",
      reason: "Existing mutating-route control debt discovered by the first complete source-derived API security inventory.",
      compensatingControls: [
        "The exact operation and finding are committed in the deterministic manifest and CI cannot silently remove or broaden this exception.",
        "The route remains subject to the existing authentication, authorization, validation, rate-limit, audit, or domain controls recorded in the manifest.",
      ],
      expiresOn,
    });
  }
}
exceptions.sort((left, right) =>
  left.route.localeCompare(right.route)
  || left.method.localeCompare(right.method)
  || left.finding.localeCompare(right.finding),
);

await writeFile(
  outputPath,
  `${JSON.stringify({ schemaVersion: 1, exceptions }, null, 2)}\n`,
  "utf8",
);
console.log(`Generated ${exceptions.length} exact API security exceptions at ${path.relative(root, outputPath)}`);
