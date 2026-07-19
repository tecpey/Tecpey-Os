import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--manifest="))?.slice("--manifest=".length)
    ?? "api-security-manifest.generated.json",
);
const baselinePath = path.resolve(root, "docs/security/generated/api-security-manifest.json");
const exceptionsPath = path.resolve(root, "config/api-security-exceptions.json");
const expiresOn = process.env.API_SECURITY_BOOTSTRAP_EXPIRY ?? "2026-08-31";

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const debt = {
  parsed_body_without_size_limit: {
    reason: "This handler still parses an untrusted request body without the governed bounded-body reader; remediation is tracked by issue #108.",
    controls: [
      "The exact operation and source hash are pinned in the committed manifest.",
      "Existing authentication, CSRF, rate-limit, parser and field-validation evidence remains visible for review.",
    ],
  },
  required_strict_revocation_missing: {
    reason: "This high-risk authenticated mutation has not yet proven strict session-revocation enforcement at the route boundary; remediation is tracked by issue #108.",
    controls: [
      "The route remains subject to its current authentication and authorization checks.",
      "CI pins the exact missing strict-revocation finding so new or changed debt cannot enter silently.",
    ],
  },
  replayable_command_without_idempotency: {
    reason: "This replayable financial or progress command does not yet expose the governed idempotency contract required by issue #108.",
    controls: [
      "Existing database transaction, ownership and domain guards remain active where present.",
      "The exact command is pinned in CI and cannot disappear or change without manifest review.",
    ],
  },
  missing_audit_or_observability_evidence: {
    reason: "This sensitive mutation lacks explicit route-level audit or observability evidence required by issue #108.",
    controls: [
      "The exact route, method, source hash and current controls are committed for review.",
      "Any source change invalidates the snapshot and forces renewed security review in CI.",
    ],
  },
};

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "security";
}

const exceptions = [];
for (const entry of manifest.routes) {
  for (const finding of entry.findings) {
    const template = debt[finding];
    if (!template) {
      throw new Error(`No reviewed bootstrap template exists for finding: ${finding}`);
    }
    const target = `${entry.method} ${entry.route} ${finding}`;
    exceptions.push({
      id: `api-debt-${createHash("sha256").update(target).digest("hex").slice(0, 12)}`,
      route: entry.route,
      method: entry.method,
      finding,
      owner: `${slug(entry.domainOwner)}-domain`,
      issue: "#108",
      reason: template.reason,
      compensatingControls: template.controls,
      expiresOn,
    });
  }
}

await mkdir(path.dirname(baselinePath), { recursive: true });
await writeFile(baselinePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(
  exceptionsPath,
  `${JSON.stringify({ schemaVersion: 1, exceptions }, null, 2)}\n`,
  "utf8",
);
console.log(
  `API security baseline bootstrapped: ${manifest.routes.length} operations, `
  + `${exceptions.length} exact exceptions expiring ${expiresOn}.`,
);
