import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const apiRoot = path.join(root, "src", "app", "api");
const testsRoot = path.join(root, "src", "tests");
const mutationMethods = ["POST", "PUT", "PATCH", "DELETE"];

async function walk(directory, predicate = () => true) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute, predicate));
    else if (predicate(absolute)) output.push(absolute);
  }
  return output;
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function routePath(file) {
  const routeRelative = path.relative(apiRoot, path.dirname(file)).split(path.sep).join("/");
  return `/api/${routeRelative}`.replace(/\/$/, "");
}

function hasExport(source, method) {
  const patterns = [
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`),
    new RegExp(`export\\s+const\\s+${method}\\b`),
    new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`),
  ];
  return patterns.some((pattern) => pattern.test(source));
}

function matchFirst(source, patterns) {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return match[1] ?? match[0];
  }
  return null;
}

function detectClassification(route, source) {
  if (route.startsWith("/api/internal/")) return "internal";
  if (route.startsWith("/api/admin/") || route.startsWith("/api/command-center/")) return "admin";
  if (/requireAdmin|adminSession|admin_users|verifyAdmin|assertAdmin|ADMIN_/i.test(source)) return "admin";
  if (/getCanonicalSession|requireAuth|requireUser|studentId|userId|session\./.test(source)) return "authenticated";
  return "public";
}

function detectRisk(route, source) {
  const values = [];
  const tests = [
    ["financial", /order|withdraw|deposit|wallet|balance|trade|exchange|payment|settlement|broadcast/i],
    ["credential", /auth|login|password|passkey|webauthn|2fa|otp|session|token|recovery/i],
    ["privacy", /profile|kyc|identity|device-token|lead|crm|consent|preference/i],
    ["admin", /admin|command-center|campaign/i],
    ["ai-memory", /mentor|memory|conversation|recompute|ai-/i],
    ["progress", /academy|progress|assessment|certificate/i],
  ];
  for (const [name, pattern] of tests) {
    if (pattern.test(route) || pattern.test(source)) values.push(name);
  }
  return [...new Set(values)].sort();
}

function detectControls(source) {
  const rateLimitNamespace = matchFirst(source, [
    /namespace:\s*["'`]([^"'`]+)["'`]/,
    /rateLimit\w*\([^)]*["'`]([^"'`]+)["'`]/s,
  ]);
  return {
    csrf: /verifyCsrfOrigin|verifyCsrfToken|assertSameOrigin|requireCsrf|csrfProtection/.test(source),
    strictRevocation: /strictRevocation\s*:\s*true/.test(source),
    rateLimit: /rateLimit(?:User|Distributed)?\s*\(/.test(source),
    rateLimitNamespace,
    bodySizeLimit: /checkBodySize|content-length|MAX_(?:BODY|PAYLOAD)|bodySizeLimit|readJsonBody\s*\(/i.test(source),
    contentTypeCheck: /content-type|application\/json|formData\s*\(/i.test(source),
    inputParser: matchFirst(source, [
      /\b(req|request)\.json\s*\(/,
      /\b(req|request)\.formData\s*\(/,
      /\b(req|request)\.text\s*\(/,
      /parse[A-Z][A-Za-z0-9_]*\s*\(/,
    ]),
    idempotency: /Idempotency-Key|idempotency|request_hash|commandId|correlationId/i.test(source),
    transaction: /withTx\s*\(|withDb\s*\(|BEGIN|transaction\s*\(|\.tx\s*\(/.test(source),
    verifiedPrincipal: /getCanonicalSession|requireAuth|requireUser|requireAdmin|verifyAccessToken|serviceIdentity|verifyInternal/i.test(source),
    tenantFromVerifiedContext: /tenantContext|session\.tenant|principal\.tenant|requireTenant|canonicalTenant/i.test(source),
    noStore: /Cache-Control[^\n]*(?:no-store|private)|cache:\s*["']no-store["']|noStore\s*\(/i.test(source),
    audit: /audit|securityEvent|student_events|admin_events|logger\.(?:info|warn|error)|withObservability/i.test(source),
    redaction: /redact|sanitize|safeError|apiError|withObservability/i.test(source),
    failClosed: /503|service_not_configured|unavailable|dependency|if\s*\(!result\.enabled\)|fail.closed/i.test(source),
  };
}

function policyFindings(entry) {
  const findings = [];
  const highRisk = entry.risk.some((risk) => ["financial", "credential", "privacy", "admin", "ai-memory"].includes(risk));
  const cookieAuthenticated = ["authenticated", "admin"].includes(entry.classification);
  if (cookieAuthenticated && !entry.controls.csrf) findings.push("cookie_authenticated_mutation_without_csrf");
  if (highRisk && !entry.controls.strictRevocation) findings.push("high_risk_mutation_without_strict_revocation");
  if (!entry.controls.bodySizeLimit) findings.push("unbounded_request_body");
  if (entry.classification === "public" && !entry.controls.rateLimit) findings.push("public_mutation_without_rate_limit");
  if (entry.risk.some((risk) => ["financial", "progress"].includes(risk)) && !entry.controls.idempotency) {
    findings.push("replayable_command_without_idempotency");
  }
  if (["authenticated", "admin"].includes(entry.classification) && !entry.controls.verifiedPrincipal) {
    findings.push("missing_verified_principal_source");
  }
  if (!entry.controls.noStore) findings.push("private_mutation_without_explicit_no_store");
  if (!entry.controls.audit) findings.push("missing_audit_or_observability_evidence");
  if (!entry.controls.redaction) findings.push("missing_error_redaction_evidence");
  if (entry.classification === "internal" && !/serviceIdentity|verifyInternal|INTERNAL_|Bearer|authorization/i.test(entry.sourceExcerpt)) {
    findings.push("internal_route_without_service_identity_evidence");
  }
  return findings;
}

async function loadTestIndex() {
  let files = [];
  try {
    files = await walk(testsRoot, (file) => /\.test\.(?:ts|tsx|js|mjs)$/.test(file));
  } catch {
    return [];
  }
  return Promise.all(files.map(async (file) => ({
    path: relative(file),
    source: await readFile(file, "utf8"),
  })));
}

function testReferences(route, sourcePath, tests) {
  const routeToken = route.replace(/^\/api\//, "");
  const stem = path.basename(path.dirname(sourcePath));
  return tests
    .filter((test) => test.source.includes(route) || test.source.includes(sourcePath) || (stem.length > 3 && test.source.includes(stem)) || test.path.includes(routeToken))
    .map((test) => test.path)
    .slice(0, 20);
}

const routeFiles = (await walk(apiRoot, (file) => file.endsWith(`${path.sep}route.ts`))).sort();
const tests = await loadTestIndex();
const routes = [];

for (const file of routeFiles) {
  const source = await readFile(file, "utf8");
  const sourcePath = relative(file);
  const route = routePath(file);
  const sourceHash = createHash("sha256").update(source).digest("hex").slice(0, 24);
  for (const method of mutationMethods) {
    if (!hasExport(source, method)) continue;
    const classification = detectClassification(route, source);
    const entry = {
      route,
      method,
      sourcePath,
      sourceHash,
      classification,
      principalSource: matchFirst(source, [
        /(getCanonicalSession)/,
        /(requireAdmin[A-Za-z0-9_]*)/,
        /(requireAuth[A-Za-z0-9_]*)/,
        /(verifyInternal[A-Za-z0-9_]*)/,
        /(serviceIdentity[A-Za-z0-9_]*)/,
      ]),
      tenantSource: matchFirst(source, [
        /(tenantContext[A-Za-z0-9_.]*)/,
        /(session\.tenant[A-Za-z0-9_.]*)/,
        /(requireTenant[A-Za-z0-9_]*)/,
      ]),
      risk: detectRisk(route, source),
      controls: detectControls(source),
      domainOwner: route.split("/")[2] || "root",
      testReferences: testReferences(route, sourcePath, tests),
      sourceExcerpt: source.slice(0, 12000),
    };
    entry.findings = policyFindings(entry);
    delete entry.sourceExcerpt;
    routes.push(entry);
  }
}

routes.sort((left, right) => left.route.localeCompare(right.route) || left.method.localeCompare(right.method));
const totals = {
  routeFiles: routeFiles.length,
  mutatingOperations: routes.length,
  operationsWithFindings: routes.filter((entry) => entry.findings.length > 0).length,
  findings: routes.reduce((sum, entry) => sum + entry.findings.length, 0),
};
const manifest = {
  schemaVersion: 1,
  authority: "generated-from-src-app-api-route-ts",
  methods: mutationMethods,
  totals,
  routes,
};
const output = `${JSON.stringify(manifest, null, 2)}\n`;
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
if (outputArg) {
  const destination = path.resolve(root, outputArg.slice("--output=".length));
  await writeFile(destination, output, "utf8");
  console.log(`API security manifest generated: ${path.relative(root, destination)} (${routes.length} operations)`);
} else {
  process.stdout.write(output);
}
