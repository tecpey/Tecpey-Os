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

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const groupContracts = {
  parsed_body_without_size_limit: {
    id: "bounded-bodies",
    issue: "#141",
    reason: "The operation is inventoried and existing boundary controls remain enforced while it migrates to the shared streaming bounded-body reader.",
    compensatingControls: [
      "The exact operation and source hash are pinned in the generated manifest.",
      "Existing authentication, CSRF, validation, rate-limit, and no-store controls remain unchanged.",
      "Issue #141 tracks a streaming byte-bounded parser and negative payload tests.",
    ],
    expiresOn: "2026-08-31",
  },
  required_strict_revocation_missing: {
    id: "strict-revocation",
    issue: "#142",
    reason: "The operation remains authenticated and inventoried while its principal resolution migrates to the live revocation-aware session authority.",
    compensatingControls: [
      "The exact operation and principal source remain visible in the generated manifest.",
      "Existing authentication, CSRF, authorization, and private no-store controls remain in force.",
      "Issue #142 tracks fail-closed live revocation checks and negative tests.",
    ],
    expiresOn: "2026-08-12",
  },
  replayable_command_without_idempotency: {
    id: "idempotency",
    issue: "#143",
    reason: "The command remains inventoried while it migrates to principal-scoped durable idempotency and exact replay semantics.",
    compensatingControls: [
      "Existing transaction, ownership, and domain guards remain enforced where present.",
      "The exact replay gap is pinned by route, method, finding, and source hash in CI.",
      "Issue #143 tracks exact replay, conflict, concurrency, and cross-principal tests.",
    ],
    expiresOn: "2026-08-12",
  },
  missing_audit_or_observability_evidence: {
    id: "durable-audit",
    issue: "#144",
    reason: "The sensitive mutation remains inventoried while durable actor-scoped and privacy-safe audit evidence is added.",
    compensatingControls: [
      "The exact operation and current control evidence remain pinned in the generated manifest.",
      "Existing authentication, authorization, and private response controls remain active.",
      "Issue #144 tracks durable evidence, redaction, sink-failure behavior, and negative tests.",
    ],
    expiresOn: "2026-08-12",
  },
};

function ownerForRoute(route) {
  if (route.startsWith("/api/admin/") || route.startsWith("/api/command-center/")) {
    return "admin-security-platform";
  }
  if (route.startsWith("/api/auth/") || route === "/api/academy-auth" || route.startsWith("/api/academy/auth/")) {
    return "identity-security";
  }
  if (route.startsWith("/api/ai-mentor") || route.startsWith("/api/mentor-")) {
    return "mentor-ai-platform";
  }
  if (route.startsWith("/api/device-token") || route.startsWith("/api/notifications/")) {
    return "notification-platform-security";
  }
  if (route.includes("withdraw") || route.startsWith("/api/orders")) {
    return "exchange-wallet-security";
  }
  if (route.startsWith("/api/offline-sync")) return "offline-sync-platform";
  if (route.startsWith("/api/community/")) return "social-platform-security";
  if (route.startsWith("/api/api-keys")) return "developer-platform-security";
  if (route.startsWith("/api/learning-events")) return "academy-event-platform";
  if (route.startsWith("/api/academy")) return "academy-platform";
  return "security-platform";
}

const operationsByFinding = new Map();
for (const entry of manifest.routes) {
  for (const finding of entry.findings) {
    if (!groupContracts[finding]) {
      throw new Error(`No reviewed grouped contract exists for finding: ${finding}`);
    }
    const operations = operationsByFinding.get(finding) ?? [];
    operations.push({
      route: entry.route,
      method: entry.method,
      owner: ownerForRoute(entry.route),
    });
    operationsByFinding.set(finding, operations);
  }
}

const groups = Object.entries(groupContracts)
  .filter(([finding]) => operationsByFinding.has(finding))
  .map(([finding, contract]) => ({
    id: contract.id,
    finding,
    issue: contract.issue,
    reason: contract.reason,
    compensatingControls: contract.compensatingControls,
    expiresOn: contract.expiresOn,
    operations: operationsByFinding.get(finding),
  }));

await mkdir(path.dirname(baselinePath), { recursive: true });
await writeFile(baselinePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(
  exceptionsPath,
  `${JSON.stringify({ schemaVersion: 2, groups }, null, 2)}\n`,
  "utf8",
);
console.log(
  `API security baseline bootstrapped: ${manifest.routes.length} operations, `
  + `${groups.reduce((sum, group) => sum + group.operations.length, 0)} grouped exact exceptions.`,
);
