import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateApiSecurityPolicy,
  findingKey,
} from "./api-security-manifest-policy.mjs";

function manifest(findings = ["required_csrf_missing"]) {
  return {
    schemaVersion: 1,
    authority: "generated-from-src-app-api-route-ts",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    totals: {},
    routes: [{
      route: "/api/example",
      method: "POST",
      findings,
    }],
  };
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
    const result = evaluateApiSecurityPolicy({
      manifest: duplicateManifest,
      registry: registry([exception()]),
      now,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes("duplicate operation")), true);
  });
});
