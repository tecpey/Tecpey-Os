import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  detectAdminAuthorityCall,
  detectAuditCall,
  detectCsrfCall,
  detectDirectNoStoreEvidence,
  detectPrincipalCall,
  detectRedactionCall,
  detectServiceIdentityEvidence,
  detectSessionCookieWrite,
  detectStrictRevocationCall,
  runtimeEvidenceSource,
} from "./api-security-runtime-evidence.mjs";

const root = process.cwd();
const apiRoot = path.join(root, "src", "app", "api");
const testsRoot = path.join(root, "src", "tests");
const mutationMethods = ["POST", "PUT", "PATCH", "DELETE"];
const routeMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

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

function methodExportPatterns(method) {
  return [
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`),
    new RegExp(`export\\s+const\\s+${method}\\b`),
    new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`),
  ];
}

function hasExport(source, method) {
  return methodExportPatterns(method).some((pattern) => pattern.test(source));
}

function handlerSource(source, method) {
  const directPatterns = methodExportPatterns(method).slice(0, 2);
  const matches = directPatterns
    .map((pattern) => source.match(pattern))
    .filter(Boolean)
    .sort((left, right) => left.index - right.index);
  const match = matches[0];
  if (!match || typeof match.index !== "number") return source;

  const start = match.index;
  const nextExport = new RegExp(
    `export\\s+(?:(?:async\\s+)?function|const)\\s+(?:${routeMethods.join("|")})\\b`,
    "g",
  );
  nextExport.lastIndex = start + match[0].length;
  const next = nextExport.exec(source);
  return source.slice(start, next?.index ?? source.length);
}

function matchFirst(source, patterns) {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return match[1] ?? match[0];
  }
  return null;
}

function detectClassification(route, handler) {
  if (route.startsWith("/api/internal/")) return "internal";
  if (route.startsWith("/api/admin/") || route.startsWith("/api/command-center/")) return "admin";
  if (detectAdminAuthorityCall(handler)) return "admin";
  if (detectPrincipalCall(handler)) return "authenticated";

  const runtime = runtimeEvidenceSource(handler);
  const directCookieAuthority = /\b(?:req|request)\.cookies\.get\s*\(/.test(runtime)
    && /\b(?:401|403)\b/.test(runtime);
  if (directCookieAuthority) return "authenticated";

  return "public";
}

function detectRisk(route, classification) {
  const values = [];
  const tests = [
    ["financial", /\/(?:orders?|withdraw(?:al)?s?|deposits?|wallet|balances?|trading-arena|exchange|settlement|payments?)(?:\/|$)/i],
    ["credential", /\/(?:auth|sessions?|device-token)(?:\/|$)|academy-auth(?:\/|$)|2fa|webauthn|passkey|password|recovery/i],
    ["privacy", /profile|kyc|identity|device-token|lead|crm|consent|preferences?/i],
    ["ai-memory", /ai-mentor|mentor-profile|mentor-memory|conversation|recompute/i],
    ["progress", /academy-(?:state|term-progress|lesson-assessment|lesson-progress|certificates)|\/academy\/.*(?:progress|assessment)|daily-challenge/i],
  ];
  for (const [name, pattern] of tests) {
    if (pattern.test(route)) values.push(name);
  }
  if (classification === "admin") values.push("admin");
  return [...new Set(values)].sort();
}

function detectInputParser(handler) {
  const source = runtimeEvidenceSource(handler);
  if (/\b(?:req|request)\.json\s*\(/.test(source)) return "json";
  if (/\b(?:req|request)\.formData\s*\(/.test(source)) return "form-data";
  if (/\b(?:req|request)\.text\s*\(/.test(source)) return "text";
  if (/\breadJsonBody\s*\(/.test(source)) return "bounded-json-helper";
  return matchFirst(source, [/(parse[A-Z][A-Za-z0-9_]*)\s*\(/]);
}

function detectMutationMode(handler) {
  const source = runtimeEvidenceSource(handler);
  const denies = /\b405\b|method_not_allowed|read_only|put_only|creation_protected/i.test(source);
  const mutationEvidence = /\b(?:INSERT|UPDATE|DELETE)\b|withTx\s*\(|withDb\s*\(|\.json\s*\(|formData\s*\(/i.test(source);
  return denies && !mutationEvidence ? "deny-only" : "active";
}

function detectControls(handler) {
  const source = runtimeEvidenceSource(handler);
  const rateLimitNamespace = matchFirst(source, [
    /namespace:\s*["'`]([^"'`]+)["'`]/,
    /rateLimit\w*\([^)]*["'`]([^"'`]+)["'`]/s,
  ]);
  const inputParser = detectInputParser(source);
  return {
    csrf: detectCsrfCall(source),
    strictRevocation: detectStrictRevocationCall(source),
    rateLimit: /\brateLimit(?:User|Distributed)?\s*\(/.test(source),
    rateLimitNamespace,
    expectsBody: Boolean(inputParser),
    bodySizeLimit: /\bcheckBodySize\s*\(|MAX_(?:BODY|PAYLOAD)|bodySizeLimit|\breadJsonBody\s*\(/i.test(source),
    contentTypeCheck: /\b(?:req|request)\.headers\.get\s*\(\s*["']content-type["']\s*\)|application\/json|\.formData\s*\(/i.test(source),
    inputParser,
    idempotency: /["']Idempotency-Key["']|\bidempotency[A-Za-z0-9_]*\s*\(|request_hash|commandId|correlationId|\bdedup[A-Za-z0-9_]*\s*\(/i.test(source),
    transaction: /\bwithTx\s*\(|\bwithDb\s*\(|\bBEGIN\b|\btransaction\s*\(|\.tx\s*\(/.test(source),
    verifiedPrincipal: Boolean(detectPrincipalCall(source)),
    tenantFromVerifiedContext: /tenantContext|session\.tenant|principal\.tenant|\brequireTenant\s*\(|canonicalTenant/i.test(source),
    noStore: detectDirectNoStoreEvidence(source),
    audit: detectAuditCall(source),
    redaction: detectRedactionCall(source),
    failClosed: /\b503\b|service_not_configured|unavailable|dependency|if\s*\(!result\.enabled\)|fail.closed/i.test(source),
    serviceIdentity: detectServiceIdentityEvidence(source),
    setsCookie: detectSessionCookieWrite(source),
  };
}

function detectRequirements(entry) {
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
  const highRisk = entry.risk.some((risk) => ["financial", "credential", "privacy", "admin", "ai-memory"].includes(risk));
  const cookieAuthenticated = ["authenticated", "admin"].includes(entry.classification);
  const idempotencyRequired = /\/(?:orders?|withdraw(?:al)?s?|offline-sync|trading-arena\/execution|academy-lesson-assessment|academy-term-progress|payments?)(?:\/|$)/i.test(entry.route);
  return {
    csrf: cookieAuthenticated || entry.controls.setsCookie,
    strictRevocation: cookieAuthenticated && highRisk,
    rateLimit: entry.classification === "public",
    bodySizeLimit: entry.controls.expectsBody,
    idempotency: idempotencyRequired,
    verifiedPrincipal: cookieAuthenticated,
    noStore: entry.classification !== "public" || highRisk || entry.controls.setsCookie,
    audit: highRisk || ["admin", "internal"].includes(entry.classification),
    redaction: true,
    serviceIdentity: entry.classification === "internal",
  };
}

function policyFindings(entry) {
  const findings = [];
  const requirements = entry.requirements;
  if (requirements.csrf && !entry.controls.csrf) findings.push("required_csrf_missing");
  if (requirements.strictRevocation && !entry.controls.strictRevocation) findings.push("required_strict_revocation_missing");
  if (requirements.bodySizeLimit && !entry.controls.bodySizeLimit) findings.push("parsed_body_without_size_limit");
  if (requirements.rateLimit && !entry.controls.rateLimit) findings.push("public_mutation_without_rate_limit");
  if (requirements.idempotency && !entry.controls.idempotency) findings.push("replayable_command_without_idempotency");
  if (requirements.verifiedPrincipal && !entry.controls.verifiedPrincipal) findings.push("missing_verified_principal_source");
  if (requirements.noStore && !entry.controls.noStore) findings.push("private_mutation_without_explicit_no_store");
  if (requirements.audit && !entry.controls.audit) findings.push("missing_audit_or_observability_evidence");
  if (requirements.redaction && !entry.controls.redaction) findings.push("missing_error_redaction_evidence");
  if (requirements.serviceIdentity && !entry.controls.serviceIdentity) findings.push("internal_route_without_service_identity_evidence");
  return findings;
}

function delegatedHandlerImport(source, method, handler) {
  const pattern = new RegExp(
    `import\\s*\\{\\s*${method}\\s+as\\s+([A-Za-z0-9_]+)\\s*\\}\\s*from\\s*["'](@/app/api/[^"']+/route)["']`,
  );
  const match = source.match(pattern);
  if (!match || !handler.includes(`${match[1]}(`)) return null;
  return {
    alias: match[1],
    sourcePath: match[2].replace(/^@\//, "src/") + ".ts",
  };
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
  const domain = routeToken.split("/")[0];
  return tests
    .filter((test) =>
      test.source.includes(route)
      || test.source.includes(sourcePath)
      || test.path.includes(routeToken)
      || (domain.length > 4 && test.path.includes(domain)),
    )
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
    const localHandler = handlerSource(source, method);
    const delegation = delegatedHandlerImport(source, method, localHandler);
    let effectiveSource = source;
    let effectiveHandler = localHandler;
    let delegatedTo = null;
    let delegatedSourceHash = null;
    if (delegation) {
      try {
        const delegatedAbsolute = path.join(root, delegation.sourcePath);
        effectiveSource = await readFile(delegatedAbsolute, "utf8");
        effectiveHandler = handlerSource(effectiveSource, method);
        delegatedTo = delegation.sourcePath;
        delegatedSourceHash = createHash("sha256").update(effectiveSource).digest("hex").slice(0, 24);
      } catch {
        delegatedTo = `${delegation.sourcePath}:unresolved`;
      }
    }

    const classification = detectClassification(route, effectiveHandler);
    const entry = {
      route,
      method,
      sourcePath,
      sourceHash,
      delegatedTo,
      delegatedSourceHash,
      mutationMode: detectMutationMode(effectiveHandler),
      classification,
      principalSource: detectPrincipalCall(effectiveHandler),
      tenantSource: matchFirst(runtimeEvidenceSource(effectiveHandler), [
        /(tenantContext[A-Za-z0-9_.]*)/,
        /(session\.tenant[A-Za-z0-9_.]*)/,
        /(requireTenant[A-Za-z0-9_]*)\s*\(/,
      ]),
      risk: detectRisk(route, classification),
      controls: detectControls(effectiveHandler),
      domainOwner: route.split("/")[2] || "root",
      testReferences: testReferences(route, sourcePath, tests),
    };
    entry.requirements = detectRequirements(entry);
    entry.findings = policyFindings(entry);
    routes.push(entry);
  }
}

routes.sort((left, right) => left.route.localeCompare(right.route) || left.method.localeCompare(right.method));
const findingCounts = {};
for (const entry of routes) {
  for (const finding of entry.findings) findingCounts[finding] = (findingCounts[finding] ?? 0) + 1;
}
const totals = {
  routeFiles: routeFiles.length,
  mutatingOperations: routes.length,
  activeOperations: routes.filter((entry) => entry.mutationMode === "active").length,
  denyOnlyOperations: routes.filter((entry) => entry.mutationMode === "deny-only").length,
  operationsWithFindings: routes.filter((entry) => entry.findings.length > 0).length,
  findings: routes.reduce((sum, entry) => sum + entry.findings.length, 0),
  findingCounts: Object.fromEntries(Object.entries(findingCounts).sort(([left], [right]) => left.localeCompare(right))),
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
