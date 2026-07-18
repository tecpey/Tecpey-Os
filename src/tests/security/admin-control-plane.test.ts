import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeAdminAuditHash,
  createAdminControlSessionToken,
  hasRecentStepUp,
  permissionGranted,
  redactAdminAuditValue,
  verifyAdminControlSessionToken,
} from "@/lib/admin-control-plane";

const TEST_SECRET = "test-admin-control-session-secret-at-least-32-characters";

describe("admin control plane authorization", () => {
  it("uses default deny with exact and scoped wildcard permissions", () => {
    assert.equal(permissionGranted([], "users.read"), false);
    assert.equal(permissionGranted(["users.read"], "users.read"), true);
    assert.equal(permissionGranted(["users.*"], "users.suspend"), true);
    assert.equal(permissionGranted(["*"], "wallets.policy.manage"), true);
    assert.equal(permissionGranted(["users.read"], "users.suspend"), false);
    assert.equal(permissionGranted(["users.*"], "wallets.read"), false);
    assert.equal(permissionGranted(["*"], "../invalid"), false);
  });

  it("accepts only recent non-future step-up timestamps", () => {
    const now = Date.UTC(2026, 6, 18, 20, 0, 0);
    assert.equal(hasRecentStepUp(new Date(now - 60_000).toISOString(), now, 300), true);
    assert.equal(hasRecentStepUp(new Date(now - 301_000).toISOString(), now, 300), false);
    assert.equal(hasRecentStepUp(new Date(now + 60_000).toISOString(), now, 300), false);
    assert.equal(hasRecentStepUp(null, now, 300), false);
  });

  it("issues tokens with issuer audience subject session and permission version", async () => {
    const token = await createAdminControlSessionToken({
      adminId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      jti: "33333333-3333-4333-8333-333333333333",
      permissionVersion: 7,
      authenticationMethods: ["passkey", "passkey"],
      stepUpAt: "2026-07-18T20:00:00.000Z",
      absoluteExpiresAt: new Date(Date.now() + 60_000),
    }, TEST_SECRET);

    const claims = await verifyAdminControlSessionToken(token, TEST_SECRET);
    assert.deepEqual(claims, {
      sub: "11111111-1111-4111-8111-111111111111",
      sid: "22222222-2222-4222-8222-222222222222",
      jti: "33333333-3333-4333-8333-333333333333",
      pv: 7,
      amr: ["passkey"],
      stepUpAt: "2026-07-18T20:00:00.000Z",
    });
    assert.equal(await verifyAdminControlSessionToken(token, `${TEST_SECRET}-wrong`), null);
  });
});

describe("admin audit protection", () => {
  it("redacts nested secrets without removing operational context", () => {
    const redacted = redactAdminAuditValue({
      userId: "user-1",
      token: "raw-token",
      nested: {
        password: "raw-password",
        amount: "100.00",
        cookie: "raw-cookie",
      },
    });

    assert.deepEqual(redacted, {
      userId: "user-1",
      token: "[REDACTED]",
      nested: {
        password: "[REDACTED]",
        amount: "100.00",
        cookie: "[REDACTED]",
      },
    });
  });

  it("produces deterministic order-independent hashes and chains changes", () => {
    const first = computeAdminAuditHash(null, {
      action: "users.suspend",
      resourceId: "user-1",
      after: { status: "suspended", reason: "case-7" },
    });
    const reordered = computeAdminAuditHash(null, {
      after: { reason: "case-7", status: "suspended" },
      resourceId: "user-1",
      action: "users.suspend",
    });
    const chained = computeAdminAuditHash(first, {
      action: "users.recover",
      resourceId: "user-1",
    });

    assert.equal(first, reordered);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.notEqual(chained, first);
  });
});
