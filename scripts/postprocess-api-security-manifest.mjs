import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateBodyBoundaryStages } from "./api-security-body-boundary.mjs";
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

function hasExplicitPublicCachePolicy(source) {
  return /["']cache-control["']\s*:\s*["'][^"']*\bpublic\b/i.test(source);
}

const sourceCache = new Map();
async function readSource(sourcePath) {
  if (!sourceCache.has(sourcePath)) {
    sourceCache.set(sourcePath, await readFile(path.join(root, sourcePath), "utf8"));
  }
  return sourceCache.get(sourcePath);
}

async function scopedEvidence(entry) {
  const localSource = await readSource(entry.sourcePath);
  const localEvidence = methodEvidenceSource(localSource, entry.method);
  const delegated = typeof entry.delegatedTo === "string" && !entry.delegatedTo.includes(":unresolved")
    ? entry.delegatedTo
    : null;
  const [delegatedPath, delegatedMethod] = delegated?.split("#") ?? [];
  const effectiveSourcePath = delegatedPath || entry.sourcePath;
  const effectiveMethod = delegatedMethod || entry.method;
  const effectiveSource = delegatedPath ? await readSource(effectiveSourcePath) : localSource;
  const effectiveEvidence = delegatedPath
    ? methodEvidenceSource(effectiveSource, effectiveMethod)
    : localEvidence;

  const boundaries = [{
    role: "local",
    sourcePath: entry.sourcePath,
    method: entry.method,
    source: localEvidence ?? "",
  }];
  if (delegatedPath && (delegatedPath !== entry.sourcePath || effectiveMethod !== entry.method)) {
    boundaries.push({
      role: "delegated",
      sourcePath: effectiveSourcePath,
      method: effectiveMethod,
      source: effectiveEvidence ?? "",
    });
  }

  return {
    sourcePath: effectiveSourcePath,
    method: effectiveMethod,
    source: effectiveSource,
    evidence: effectiveEvidence ?? "",
    resolved: effectiveEvidence !== null,
    boundaries,
  };
}

for (const entry of manifest.routes) {
  const scoped = await scopedEvidence(entry);
  entry.evidenceSource = {
    sourcePath: scoped.sourcePath,
    method: scoped.method,
    resolved: scoped.resolved,
  };
  entry.controls.explicitPublicCachePolicy = false;

  // The canonical Academy authentication route is credential authority even
  // though its path segment is `academy-auth` rather than `/auth/...`.
  if (entry.route === "/api/academy-auth" && !entry.risk.includes("credential")) {
    entry.risk = [...entry.risk, "credential"].sort();
  }

  // Every stage that consumes the request body is an independent allocation
  // boundary. A local compatibility handler cannot become safe merely because
  // its delegated canonical handler is bounded later in the chain.
  const bodyBoundary = evaluateBodyBoundaryStages(scoped.boundaries);
  entry.controls.expectsBody = bodyBoundary.expectsBody;
  entry.controls.inputParser = bodyBoundary.inputParser;
  entry.controls.headerBodySizeHint = bodyBoundary.headerBodySizeHint;
  entry.controls.bodySizeLimit = bodyBoundary.bodySizeLimit;
  entry.controls.bodySizeLimitAuthority = bodyBoundary.bodySizeLimitAuthority;

  // `apiOk`, `apiError`, and `apiRateLimited` inherit the central private,
  // no-store contract only when the effective handler does not provide a
  // complete explicit public Cache-Control override. A public override must
  // remain visible to policy evaluation rather than being masked by the helper.
  if (
    /from\s+["']@\/lib\/api-validation["']/.test(scoped.evidence)
    && /\b(?:apiOk|apiError|apiRateLimited)\s*\(/.test(scoped.evidence)
  ) {
    const explicitPublicCachePolicy = hasExplicitPublicCachePolicy(scoped.evidence);
    entry.controls.noStore = !explicitPublicCachePolicy;
    entry.controls.explicitPublicCachePolicy = explicitPublicCachePolicy;
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
    explicitPublicCachePolicy: false,
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
