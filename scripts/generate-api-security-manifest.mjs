import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

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

function importPrelude(source) {
  const firstExport = source.search(/export\s+(?:(?:async\s+)?function|const|\{)/);
  return firstExport > 0 ? source.slice(0, firstExport) : "";
}

function matchFirst(source, patterns) {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return match[1] ?? match[0];
  }
  return null;
}

function detectPrincipalSource(source) {
  return matchFirst(source, [
    /(getCanonicalSession)/,
    /(requireCanonicalSession)/,
    /(getAcademyAuthFromRequest)/,
    /(getStudentSessionFromRequest)/,
    /(getUnifiedSessionFromRequest)/,
    /(getNotificationIdentityFromRequest)/,
    /(verifyUnifiedSession)/,
    /(verifyAccessToken)/,
    /(setCurrentPublicVisibility)/,
    /(requireAdmin[A-Za-z0-9_]*)/,
    /(requireAuth[A-Za-z0-9_]*)/,
    /(requireUser[A-Za-z0-9_]*)/,
    /(requireStudent[A-Za-z0-9_]*)/,
    /(getAcademy[A-Za-z0-9_]*Session)/,
    /(verifyInternal[A-Za-z0-9_]*)/,
    /(serviceIdentity[A-Za-z0-9_]*)/,
    /(authenticate[A-Za-z0-9_]*)/,
    /((?:get|require|verify|resolve)[A-Za-z0-9_]*(?:Session|Identity|Principal|Auth|User|Account)[A-Za-z0-9_]*)\s*\(/,
  ]);
}

function detectClassification(route, source) {
  if (route.startsWith("/api/internal/")) return "internal";
  if (route.startsWith("/api/admin/") || route.startsWith("/api/command-center/")) return "admin";
  if (/requireAdmin|adminSession|admin_users|verifyAdmin|assertAdmin|ADMIN_/i.test(source)) return "admin";
  if (
    detectPrincipalSource(source)
    || /studentId|userId|accountId|session\.|academySession|authSession|sessionCookie/i.test(source)
    || (/verifyCsrfOrigin/.test(source) && /\b401\b/.test(source))
  ) return "authenticated";
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

function detectInputParser(source) {
  if (/\b(?:req|request)\.json\s*\(/.test(source)) return "json";
  if (/\b(?:req|request)\.formData\s*\(/.test(source)) return "form-data";
  if (/\b(?:req|request)\.text\s*\(/.test(source)) return "text";
  if (/readJsonBody\s*\(/.test(source)) return "bounded-json-helper";
  const parser = matchFirst(source, [/(parse[A-Z][A-Za-z0-9_]*)\s*\(/]);
  return parser;
}

function detectMutationMode(handler) {
  const denies = /\b405\b|method_not_allowed|read_only|put_only|creation_protected/i.test(handler);
  const mutationEvidence = /\b(?:INSERT|UPDATE|DELETE)\b|withTx\s*\(|withDb\s*\(|\.json\s*\(|formData\s*\(/i.test(handler);
  return denies && !mutationEvidence ? "deny-only" : "active";
}

function detectControls(handler, fullSource) {
  const context = `${importPrelude(fullSource)}\n${handler}`;
  const rateLimitNamespace = matchFirst(handler, [
    /namespace:\s*["'`]([^"'`]+)["'`]/,
    /rateLimit\w*\([^)]*["'`]([^"'`]+)["'`]/s,
  ]);
  const inputParser = detectInputParser(handler);
  return {
    csrf: /verifyCsrfOrigin|verifyCsrfToken|assertSameOrigin|requireCsrf|csrfProtection/.test(context),
    strictRevocation: /strictRevocation\s*:\s*true|revokeSessionStrict|requireStrictSession|assertSession.*Strict/i.test(handler),
    rateLimit: /rateLimit(?:User|Distributed)?\s*\(/.test(handler),
    rateLimitNamespace,
    expectsBody: Boolean(inputParser),
    bodySizeLimit: /checkBodySize|MAX_(?:BODY|PAYLOAD)|bodySizeLimit|readJsonBody\s*\(/i.test(handler),
    contentTypeCheck: /content-type|application\/json|formData\s*\(/i.test(handler),
    inputParser,
    idempotency: /Idempotency-Key|idempotency|request_hash|commandId|correlationId|dedup/i.test(handler),
    transaction: /withTx\s*\(|withDb\s*\(|BEGIN|transaction\s*\(|\.tx\s*\(/.test(handler),
    verifiedPrincipal: Boolean(detectPrincipalSource(context)),
    tenantFromVerifiedContext: /tenantContext|session\.tenant|principal\.tenant|requireTenant|canonicalTenant/i.test(handler),
    noStore: /Cache-Control[^\n]*(?:no-store|private)|cache:\s*["']no-store["']|noStore\s*\(|notificationApi(?:Ok|Error)|PRIVATE_HEADERS/i.test(context),
    audit: /audit|securityEvent|student_events|admin_events|logger\.(?:info|warn|error)|withObservability/i.test(context),
    redaction: /redact|sanitize|safeError|apiError|withObservability|notificationApiError/i.test(context),
    failClosed: /503|service_not_configured|unavailable|dependency|if\s*\(!result\.enabled\)|fail.closed/i.test(handler),
    serviceIdentity: /serviceIdentity|verifyInternal|INTERNAL_|Bearer|authorization/i.test(context),
    setsCookie: /Set-Cookie|\.cookies\.set\s*\(|cookies\(\)\.set\s*\(/i.test(handler),
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

    const effectiveContext = `${importPrelude(effectiveSource)}\n${effectiveHandler}`;
    const classification = detectClassification(route, effectiveContext);
    const entry = {
      route,
      method,
      sourcePath,
      sourceHash,
      delegatedTo,
      delegatedSourceHash,
      mutationMode: detectMutationMode(effectiveHandler),
      classification,
      principalSource: detectPrincipalSource(effectiveContext),
      tenantSource: matchFirst(effectiveHandler, [
        /(tenantContext[A-Za-z0-9_.]*)/,
        /(session\.tenant[A-Za-z0-9_.]*)/,
        /(requireTenant[A-Za-z0-9_]*)/,
      ]),
      risk: detectRisk(route, classification),
      controls: detectControls(effectiveHandler, effectiveSource),
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
