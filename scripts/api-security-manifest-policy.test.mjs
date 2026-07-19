import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateApiSecurityPolicy,
  findingKey,
} from "./api-security-manifest-policy.mjs";

function route(findings = ["required_csrf_missing"], overrides = {}) {
  const csrfMissing = findings.includes("required_csrf_missing");
  return {
    route: "/api/example",
    method: "POST",
    sourcePath: "src/app/api/example/route.ts",
    sourceHash: "0123456789abcdef01234567",
    delegatedTo: null,
    delegatedSourceHash: null,
    mutationMode: "active",
    classification: "authenticated",
    principalSource: "getCanonicalSession",
    tenantSource: null,
    risk: [],
    controls: {
      csrf: !csrfMissing,
      strictRevocation: false,
      rateLimit: false,
      rateLimitNamespace: null,
      expectsBody: false,
      bodySizeLimit: false,
      contentTypeCheck: false,
      inputParser: null,
      idempotency: false,
      transaction: false,
      verifiedPrincipal: true,
      tenantFromVerifiedContext: false,
      noStore: true,
      audit: false,
      redaction: true,
      failClosed: true,
      serviceIdentity: false,
      setsCookie: false,
      headerBodySizeHint: false,
      bodySizeLimitAuthority: null,
      explicitPublicCachePolicy: false,
    },
    requirements: {
      csrf: csrfMissing,
      strictRevocation: false,
      rateLimit: false,
      bodySizeLimit: false,
      idempotency: false,
      verifiedPrincipal: true,
      noStore: true,
      audit: false,
      redaction: true,
      serviceIdentity: false,
    },
    domainOwner: "example",
    testReferences: [],
    findings,
    evidenceSource: {
      sourcePath: "src/app/api/example/route.ts",
      method: "POST",
      resolved: true,
    },
    ...overrides,
  };
}

function withTotals(routes) {
  const findingCounts = {};
  for (const entry of routes) {
    for (const finding of entry.findings) findingCounts[finding] = (findingCounts[finding] ?? 0) + 1;
  }
  return {
    routeFiles: new Set(routes.map((entry) => entry.sourcePath)).size || 1,
    mutatingOperations: routes.length,
    activeOperations: routes.filter((entry) => entry.mutationMode === "active").length,
    denyOnlyOperations: routes.filter((entry) => entry.mutationMode === "deny-only").length,
    operationsWithFindings: routes.filter((entry) => entry.findings.length > 0).length,
    findings: routes.reduce((sum, entry) => sum + entry.findings.length, 0),
    findingCounts,
  };
}

function manifest(findings = ["required_csrf_missing"]) {
  const routes = [route(findings)];
  return {
    schemaVersion: 1,
    authority: "generated-from-src-app-api-route-ts",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    totals: withTotals(routes),
    routes,
  };
}

function refreshTotals(value) {
  value.totals = withTotals(value.routes);
  return value;
}

function exception(overrides = {}) {
  return {
    id: "api-example-post-csrf",
    route: "/api/example",
    method: "POST",
    finding: "required_csrf_missing",
    owner: "security-platform",
    issue: "#108",
    reason: "Existing route debt is tracked for a bounded remediation window.",
    compensatingControls: ["The exact route remains visible in the committed CI manifest."],
    expiresOn: "2026-08-31",
    ...overrides,
  };
}

function registry(exceptions) {
  return { schemaVersion: 1, exceptions };
}

function groupedRegistry(overrides = {}) {
  return {
    schemaVersion: 2,
    groups: [{
      id: "csrf-remediation",
      finding: "required_csrf_missing",
      issue: "#108",
      reason: "Existing route debt is tracked for a bounded remediation window.",
      compensatingControls: ["The exact route remains visible in the committed CI manifest."],
      expiresOn: "2026-08-31",
      operations: [{
        route: "/api/example",
        method: "POST",
        owner: "security-platform",
      }],
      ...overrides,
    }],
  };
}

const now = new Date("2026-07-20T00:00:00.000Z");

describe("API security manifest exception policy", () => {
  it("rejects an uncovered finding", () => {
    const result = evaluateApiSecurityPolicy({ manifest: manifest(), registry: registry([]), now });
    assert.equal(result.ok, false);
    assert.deepEqual(result.uncovered, [findingKey("/api/example", "POST", "required_csrf_missing")]);
  });

  it("accepts one exact, valid, unexpired legacy exception", () => {
    const result = evaluateApiSecurityPolicy({ manifest: manifest(), registry: registry([exception()]), now });
    assert.equal(result.ok, true);
    assert.deepEqual(result.uncovered, []);
  });

  it("accepts one exact operation in a compact remediation group", () => {
    const result = evaluateApiSecurityPolicy({ manifest: manifest(), registry: groupedRegistry(), now });
    assert.equal(result.ok, true);
    assert.equal(result.exceptionCount, 1);
    assert.deepEqual(result.uncovered, []);
  });

  it("rejects wildcard and expired legacy exceptions", () => {
    const result = evaluateApiSecurityPolicy({
      manifest: manifest(),
      registry: registry([exception({ route: "/api/*", expiresOn: "2026-07-01" })]),
      now,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes("without wildcards")), true);
    assert.equal(result.errors.some((error) => error.includes("expired exception")), true);
  });

  it("rejects wildcard and expired grouped operations", () => {
    const result = evaluateApiSecurityPolicy({
      manifest: manifest(),
      registry: groupedRegistry({
        expiresOn: "2026-07-01",
        operations: [{ route: "/api/*", method: "POST", owner: "security-platform" }],
      }),
      now,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes("without wildcards")), true);
    assert.equal(result.errors.some((error) => error.includes("expired exception")), true);
  });

  it("rejects stale and duplicate legacy exception targets", () => {
    const first = exception();
    const second = exception({ id: "api-example-post-csrf-copy" });
    const result = evaluateApiSecurityPolicy({
      manifest: manifest([]),
      registry: registry([first, second]),
      now,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes("duplicate exception target")), true);
    assert.equal(result.errors.filter((error) => error.includes("stale exception")).length, 2);
  });

  it("rejects stale and duplicate grouped targets", () => {
    const grouped = groupedRegistry();
    grouped.groups.push({
      ...grouped.groups[0],
      id: "csrf-remediation-copy",
      operations: [{ ...grouped.groups[0].operations[0] }],
    });
    const result = evaluateApiSecurityPolicy({
      manifest: manifest([]),
      registry: grouped,
      now,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes("duplicate exception target")), true);
    assert.equal(result.errors.filter((error) => error.includes("stale exception")).length, 2);
  });

  it("rejects duplicate group identifiers", () => {
    const grouped = groupedRegistry();
    grouped.groups.push({ ...grouped.groups[0] });
    const result = evaluateApiSecurityPolicy({ manifest: manifest(), registry: grouped, now });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes("duplicate exception group id")), true);
  });

  it("rejects duplicate operations in the manifest", () => {
    const duplicateManifest = manifest();
    duplicateManifest.routes.push({ ...duplicateManifest.routes[0] });
    refreshTotals(duplicateManifest);
    const result = evaluateApiSecurityPolicy({
      manifest: duplicateManifest,
      registry: registry([exception()]),
      now,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes("duplicate operation")), true);
  });

  it("rejects inconsistent totals", () => {
    const value = manifest();
    value.totals.findings = 99;
    const result = evaluateApiSecurityPolicy({ manifest: value, registry: registry([exception()]), now });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes("totals.findings")), true);
  });

  it("rejects findings that do not match requirements and controls", () => {
    const value = manifest([]);
    value.routes[0].findings = ["missing_audit_or_observability_evidence"];
    refreshTotals(value);
    const result = evaluateApiSecurityPolicy({ manifest: value, registry: registry([]), now });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes("findings do not match")), true);
  });

  it("rejects unresolved method evidence", () => {
    const value = manifest();
    value.routes[0].evidenceSource.resolved = false;
    const result = evaluateApiSecurityPolicy({ manifest: value, registry: registry([exception()]), now });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes("must resolve")), true);
  });

  it("rejects body-limit claims without named authority", () => {
    const value = manifest([]);
    value.routes[0].controls.bodySizeLimit = true;
    const result = evaluateApiSecurityPolicy({ manifest: value, registry: registry([]), now });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes("requires named enforceable authority")), true);
  });

  it("rejects contradictory public-cache and no-store evidence", () => {
    const value = manifest([]);
    value.routes[0].controls.explicitPublicCachePolicy = true;
    const result = evaluateApiSecurityPolicy({ manifest: value, registry: registry([]), now });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes("both explicit public caching and no-store")), true);
  });

  it("rejects unknown fields in manifest operations and registries", () => {
    const value = manifest();
    value.routes[0].unreviewedControl = true;
    const grouped = groupedRegistry({ unreviewedMetadata: "unsafe" });
    const result = evaluateApiSecurityPolicy({ manifest: value, registry: grouped, now });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes("unreviewedControl is not allowed")), true);
    assert.equal(result.errors.some((error) => error.includes("unreviewedMetadata is not allowed")), true);
  });
});
