import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { detectBodyLimitEvidence } from "./api-security-body-limit-policy.mjs";
import { methodEvidenceSource } from "./api-security-source-evidence.mjs";

const root = process.cwd();
const manifestPath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--manifest="))?.slice("--manifest=".length)
    ?? "api-security-manifest.generated.json",
);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function highRisk(entry) {
  return entry.risk.some((risk) =>
    ["financial", "credential", "privacy", "admin", "ai-memory"].includes(risk),
  );
}

function idempotencyRequired(route) {
  return /\/(?:orders?|withdraw(?:al)?s?|offline-sync|trading-arena\/execution|academy-lesson-assessment|academy-term-progress|payments?)(?:\/|$)/i.test(route);
}

function requirements(entry) {
  if (entry.mutationMode === "deny-only") {
    return {
      csrf: false,
      strictRevocation: false,
      rateLimit: false,
      bodySizeLimit: false,
      idempotency: false,
      verifiedPrincipal: false,
      noStore: true,
      audit: false,
      redaction: true,
      serviceIdentity: false,
    };
  }
  const cookieAuthenticated = ["authenticated", "admin"].includes(entry.classification);
  return {
    csrf: cookieAuthenticated || entry.controls.setsCookie,
    strictRevocation: cookieAuthenticated && highRisk(entry),
    rateLimit: entry.classification === "public",
    bodySizeLimit: entry.controls.expectsBody,
    idempotency: idempotencyRequired(entry.route),
    verifiedPrincipal: cookieAuthenticated,
    noStore: entry.classification !== "public" || highRisk(entry) || entry.controls.setsCookie,
    audit: highRisk(entry) || ["admin", "internal"].includes(entry.classification),
    redaction: true,
    serviceIdentity: entry.classification === "internal",
  };
}

function findings(entry) {
  const output = [];
  const required = entry.requirements;
  if (required.csrf && !entry.controls.csrf) output.push("required_csrf_missing");
  if (required.strictRevocation && !entry.controls.strictRevocation) output.push("required_strict_revocation_missing");
  if (required.bodySizeLimit && !entry.controls.bodySizeLimit) output.push("parsed_body_without_size_limit");
  if (required.rateLimit && !entry.controls.rateLimit) output.push("public_mutation_without_rate_limit");
  if (required.idempotency && !entry.controls.idempotency) output.push("replayable_command_without_idempotency");
  if (required.verifiedPrincipal && !entry.controls.verifiedPrincipal) output.push("missing_verified_principal_source");
  if (required.noStore && !entry.controls.noStore) output.push("private_mutation_without_explicit_no_store");
  if (required.audit && !entry.controls.audit) output.push("missing_audit_or_observability_evidence");
  if (required.redaction && !entry.controls.redaction) output.push("missing_error_redaction_evidence");
  if (required.serviceIdentity && !entry.controls.serviceIdentity) output.push("internal_route_without_service_identity_evidence");
  return output;
}

const sourceCache = new Map();
async function readSource(sourcePath) {
  if (!sourceCache.has(sourcePath)) {
    sourceCache.set(sourcePath, await readFile(path.join(root, sourcePath), "utf8"));
  }
  return sourceCache.get(sourcePath);
}

async function scopedEvidence(entry) {
  const delegated = typeof entry.delegatedTo === "string" && !entry.delegatedTo.includes(":unresolved")
    ? entry.delegatedTo
    : null;
  const [delegatedPath, delegatedMethod] = delegated?.split("#") ?? [];
  const sourcePath = delegatedPath || entry.sourcePath;
  const method = delegatedMethod || entry.method;
  const source = await readSource(sourcePath);
  const evidence = methodEvidenceSource(source, method);
  return {
    sourcePath,
    method,
    source,
    evidence: evidence ?? "",
    resolved: evidence !== null,
  };
}

for (const entry of manifest.routes) {
  const scoped = await scopedEvidence(entry);
  entry.evidenceSource = {
    sourcePath: scoped.sourcePath,
    method: scoped.method,
    resolved: scoped.resolved,
  };

  // The canonical Academy authentication route is credential authority even
  // though its path segment is `academy-auth` rather than `/auth/...`.
  if (entry.route === "/api/academy-auth" && !entry.risk.includes("credential")) {
    entry.risk = [...entry.risk, "credential"].sort();
  }

  // Content-Length can be absent, forged, or bypassed by chunked transfer. It is
  // useful for an early rejection only and must never satisfy the governed body
  // limit requirement. Evidence is deliberately scoped to the effective method,
  // so another handler in the same route file cannot lend its controls.
  const bodyEvidence = detectBodyLimitEvidence(scoped.evidence);
  entry.controls.headerBodySizeHint = bodyEvidence.headerHint;
  entry.controls.bodySizeLimitAuthority = bodyEvidence.authority;
  if (entry.controls.expectsBody) {
    entry.controls.bodySizeLimit = scoped.resolved && bodyEvidence.enforceable;
  }

  // `apiOk`, `apiError`, and `apiRateLimited` inherit the central private,
  // no-store contract from src/lib/api-validation.ts. Both the import and the
  // response call must occur in the effective method evidence.
  if (
    /from\s+["']@\/lib\/api-validation["']/.test(scoped.evidence)
    && /\b(?:apiOk|apiError|apiRateLimited)\s*\(/.test(scoped.evidence)
  ) {
    entry.controls.noStore = true;
  }

  // Notification response builders wrap the same central contract with an
  // explicit private header set.
  if (/notificationApi(?:Ok|Error)\s*\(/.test(scoped.evidence)) {
    entry.controls.noStore = true;
    entry.controls.redaction = true;
  }

  // The admin control-plane helper loads the live database session, checks
  // revocation/expiry/status/permission version, RBAC and optional step-up.
  if (/authorizeAdminRequest\s*\(/.test(scoped.evidence)) {
    entry.classification = "admin";
    entry.principalSource = "authorizeAdminRequest";
    entry.controls.verifiedPrincipal = true;
    entry.controls.strictRevocation = true;
  }

  const principalHelper = scoped.evidence.match(
    /\b(getNotificationIdentityFromRequest|getAcademyAuthFromRequest|getStudentSessionFromRequest|getUnifiedSessionFromRequest|verifyUnifiedSession|setCurrentPublicVisibility)\s*\(/,
  )?.[1];
  if (principalHelper && entry.classification !== "public") {
    entry.principalSource = entry.principalSource ?? principalHelper;
    entry.controls.verifiedPrincipal = true;
  }
}

// Compatibility POST delegates to the canonical DELETE logout authority.
const logoutAlias = manifest.routes.find(
  (entry) => entry.route === "/api/academy/auth/logout" && entry.method === "POST",
);
const logoutAuthority = manifest.routes.find(
  (entry) => entry.route === "/api/academy-auth" && entry.method === "DELETE",
);
if (logoutAlias && logoutAuthority) {
  logoutAlias.delegatedTo = `${logoutAuthority.sourcePath}#DELETE`;
  logoutAlias.delegatedSourceHash = logoutAuthority.sourceHash;
  logoutAlias.classification = logoutAuthority.classification;
  logoutAlias.principalSource = logoutAuthority.principalSource;
  logoutAlias.tenantSource = logoutAuthority.tenantSource;
  logoutAlias.controls = {
    ...logoutAuthority.controls,
    csrf: logoutAlias.controls.csrf || logoutAuthority.controls.csrf,
    noStore: true,
  };
  logoutAlias.evidenceSource = {
    sourcePath: logoutAuthority.sourcePath,
    method: "DELETE",
    resolved: true,
  };
}

for (const entry of manifest.routes) {
  entry.requirements = requirements(entry);
  entry.findings = findings(entry);
}

const findingCounts = {};
for (const entry of manifest.routes) {
  for (const finding of entry.findings) findingCounts[finding] = (findingCounts[finding] ?? 0) + 1;
}
manifest.totals = {
  routeFiles: manifest.totals.routeFiles,
  mutatingOperations: manifest.routes.length,
  activeOperations: manifest.routes.filter((entry) => entry.mutationMode === "active").length,
  denyOnlyOperations: manifest.routes.filter((entry) => entry.mutationMode === "deny-only").length,
  operationsWithFindings: manifest.routes.filter((entry) => entry.findings.length > 0).length,
  findings: manifest.routes.reduce((sum, entry) => sum + entry.findings.length, 0),
  findingCounts: Object.fromEntries(
    Object.entries(findingCounts).sort(([left], [right]) => left.localeCompare(right)),
  ),
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(
  `API security manifest postprocessed: ${path.relative(root, manifestPath)} `
  + `(${manifest.totals.findings} findings)`,
);
