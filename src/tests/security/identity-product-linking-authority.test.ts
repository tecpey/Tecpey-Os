import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IdentityLinkingRuntimeError,
  assertExactRedirectUriAllowed,
  canonicalizeMentorExchangeReadScopes,
  fingerprintProductAccountRef,
  fingerprintProviderSubjectRef,
  prepareProductAccountLinkCeremony,
  resolveIdentityLinkFingerprintKey,
} from "../../lib/security/identity-product-linking-authority";

const TEST_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef-runtime-linking-test-key",
  "utf8",
);

function expectCode(action: () => unknown, code: string): void {
  assert.throws(action, (error) =>
    error instanceof IdentityLinkingRuntimeError && error.code === code,
  );
}

describe("Identity product-linking runtime authority", () => {
  it("uses domain-separated keyed fingerprints without retaining raw account references", () => {
    const raw = "exchange-account-4815162342";
    const base = fingerprintProductAccountRef({
      tenantId: "tenant-a",
      product: "exchange",
      externalAccountRef: raw,
      key: TEST_KEY,
    });
    const replay = fingerprintProductAccountRef({
      tenantId: "tenant-a",
      product: "exchange",
      externalAccountRef: raw,
      key: TEST_KEY,
    });
    const otherTenant = fingerprintProductAccountRef({
      tenantId: "tenant-b",
      product: "exchange",
      externalAccountRef: raw,
      key: TEST_KEY,
    });
    const otherProduct = fingerprintProductAccountRef({
      tenantId: "tenant-a",
      product: "academy",
      externalAccountRef: raw,
      key: TEST_KEY,
    });
    const providerSubject = fingerprintProviderSubjectRef({
      tenantId: "tenant-a",
      providerSubjectRef: raw,
      key: TEST_KEY,
    });

    assert.match(base, /^[0-9a-f]{64}$/);
    assert.equal(base, replay);
    assert.notEqual(base, otherTenant);
    assert.notEqual(base, otherProduct);
    assert.notEqual(base, providerSubject);
    assert.equal(base.includes(raw), false);
  });

  it("fails closed on a missing or weak production fingerprint key", () => {
    expectCode(
      () => resolveIdentityLinkFingerprintKey({ nodeEnv: "production", envValue: undefined }),
      "fingerprint_key_missing",
    );
    expectCode(
      () => resolveIdentityLinkFingerprintKey({ nodeEnv: "production", envValue: "too-short" }),
      "fingerprint_key_too_short",
    );
    assert.ok(
      resolveIdentityLinkFingerprintKey({
        nodeEnv: "production",
        envValue: "0123456789abcdef0123456789abcdef",
      }).byteLength >= 32,
    );
  });

  it("canonicalizes read scopes, deduplicates them and rejects financial write authority", () => {
    assert.deepEqual(
      canonicalizeMentorExchangeReadScopes([
        "exchange.performance.summary.read",
        "exchange.portfolio.risk_summary.read",
        "exchange.performance.summary.read",
      ]),
      [
        "exchange.performance.summary.read",
        "exchange.portfolio.risk_summary.read",
      ],
    );
    expectCode(
      () => canonicalizeMentorExchangeReadScopes(["exchange.orders.write"]),
      "invalid_scope",
    );
    expectCode(
      () => canonicalizeMentorExchangeReadScopes([
        "exchange.profile.summary.read",
        "exchange.kyc.status.read",
        "exchange.portfolio.risk_summary.read",
        "exchange.activity.summary.read",
        "exchange.behavior.risk_signals.read",
        "exchange.performance.summary.read",
        "exchange.orders.write",
      ]),
      "too_many_scopes",
    );
  });

  it("requires exact HTTPS redirect allowlisting instead of origin-only matching", () => {
    const allowed = [
      "https://tecpey.com/api/identity/exchange-link/callback",
      "https://www.tecpey.com/api/identity/exchange-link/callback",
    ];
    assert.equal(
      assertExactRedirectUriAllowed(allowed[0], allowed),
      allowed[0],
    );
    expectCode(
      () => assertExactRedirectUriAllowed(
        "https://tecpey.com/api/identity/exchange-link/other",
        allowed,
      ),
      "redirect_uri_not_allowlisted",
    );
    expectCode(
      () => assertExactRedirectUriAllowed(
        "https://tecpey.com/api/identity/exchange-link/callback#fragment",
        allowed,
      ),
      "invalid_redirect_uri",
    );
    expectCode(
      () => assertExactRedirectUriAllowed(
        "http://tecpey.com/api/identity/exchange-link/callback",
        allowed,
      ),
      "invalid_redirect_uri",
    );
  });

  it("creates high-entropy one-time ceremony material and persists hashes only", () => {
    const prepared = prepareProductAccountLinkCeremony({
      redirectUri: "https://tecpey.com/api/identity/exchange-link/callback",
      allowedRedirectUris: [
        "https://tecpey.com/api/identity/exchange-link/callback",
      ],
      scopes: [
        "exchange.portfolio.risk_summary.read",
        "exchange.behavior.risk_signals.read",
      ],
      now: new Date("2026-09-06T10:00:00.000Z"),
      stateBytes: Buffer.alloc(32, 0x11),
      proofBytes: Buffer.alloc(32, 0x22),
    });

    assert.ok(prepared.state.length >= 40);
    assert.ok(prepared.proofVerifier.length >= 40);
    assert.match(prepared.stateHash, /^[0-9a-f]{64}$/);
    assert.match(prepared.proofChallengeHash, /^[0-9a-f]{64}$/);
    assert.match(prepared.redirectUriHash, /^[0-9a-f]{64}$/);
    assert.notEqual(prepared.stateHash, prepared.state);
    assert.notEqual(prepared.proofChallengeHash, prepared.proofVerifier);
    assert.equal(
      prepared.expiresAt.toISOString(),
      "2026-09-06T10:10:00.000Z",
    );
    assert.deepEqual(prepared.requestedScopes, [
      "exchange.behavior.risk_signals.read",
      "exchange.portfolio.risk_summary.read",
    ]);
  });

  it("rejects malformed opaque account references before hashing", () => {
    expectCode(
      () => fingerprintProductAccountRef({
        tenantId: "tenant-a",
        product: "exchange",
        externalAccountRef: " leading-space",
        key: TEST_KEY,
      }),
      "invalid_external_account_ref",
    );
    expectCode(
      () => fingerprintProductAccountRef({
        tenantId: "tenant-a",
        product: "exchange",
        externalAccountRef: "line\nbreak",
        key: TEST_KEY,
      }),
      "invalid_external_account_ref",
    );
  });
});
