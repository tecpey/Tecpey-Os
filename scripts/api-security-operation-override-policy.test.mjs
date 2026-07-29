import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateOperationOverride } from "./api-security-operation-override-policy.mjs";

function entry(overrides = {}) {
  return {
    route: "/api/auth/example",
    method: "POST",
    classification: "authenticated",
    risk: ["credential"],
    delegatedTo: null,
    controls: {
      rateLimit: true,
      csrf: true,
      setsCookie: false,
    },
    ...overrides,
  };
}

function preAuth(overrides = {}) {
  return {
    route: "/api/auth/example",
    method: "POST",
    authorityType: "pre-authentication",
    classification: "public",
    principalSource: null,
    controlOverrides: {
      verifiedPrincipal: false,
      noStore: true,
    },
    requirementOverrides: {
      strictRevocation: false,
      verifiedPrincipal: false,
    },
    reason: "This endpoint establishes the first authenticated session after proof verification.",
    issue: "#108",
    ...overrides,
  };
}

describe("API operation override authority", () => {
  it("accepts a bounded pre-authentication contract", () => {
    assert.deepEqual(validateOperationOverride(preAuth(), entry()), []);
  });

  it("rejects manual body-limit and idempotency evidence", () => {
    const errors = validateOperationOverride(
      preAuth({
        controlOverrides: {
          verifiedPrincipal: false,
          noStore: true,
          bodySizeLimit: true,
        },
        requirementOverrides: {
          strictRevocation: false,
          verifiedPrincipal: false,
          idempotency: false,
        },
      }),
      entry(),
    );
    assert.equal(errors.some((error) => error.includes("bodySizeLimit cannot be asserted manually")), true);
    assert.equal(errors.some((error) => error.includes("idempotency cannot be overridden")), true);
  });

  it("rejects pre-authentication without source-derived rate limiting", () => {
    const errors = validateOperationOverride(
      preAuth(),
      entry({ controls: { rateLimit: false, csrf: true, setsCookie: false } }),
    );
    assert.equal(errors.some((error) => error.includes("source-derived rate limiting")), true);
  });

  it("rejects session-setting pre-authentication without CSRF", () => {
    const errors = validateOperationOverride(
      preAuth(),
      entry({ controls: { rateLimit: true, csrf: false, setsCookie: true } }),
    );
    assert.equal(errors.some((error) => error.includes("session-setting")), true);
  });

  it("rejects a compatibility alias without a resolved canonical handler", () => {
    const errors = validateOperationOverride({
      route: "/api/alias",
      method: "POST",
      authorityType: "compatibility-alias",
      classification: "authenticated",
      principalSource: "canonical handler",
      controlOverrides: { noStore: true },
      requirementOverrides: {},
      reason: "The compatibility route delegates its entire request to a canonical governed handler.",
      issue: "#108",
    }, entry({ route: "/api/alias", delegatedTo: null }));
    assert.equal(errors.some((error) => error.includes("resolve to a canonical handler")), true);
  });

  it("rejects live-principal contracts that relax requirements", () => {
    const errors = validateOperationOverride({
      route: "/api/admin/logout",
      method: "POST",
      authorityType: "live-principal",
      classification: "admin",
      principalSource: "loadAdminPrincipal",
      controlOverrides: { verifiedPrincipal: true, noStore: true },
      requirementOverrides: { strictRevocation: false },
      reason: "The operation resolves the current live database-backed principal before mutation.",
      issue: "#108",
    }, entry({ route: "/api/admin/logout", risk: ["admin"] }));
    assert.equal(errors.some((error) => error.includes("cannot relax security requirements")), true);
  });
});
