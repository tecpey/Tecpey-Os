import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateAuthProviderUpdate,
  resolveAuthProviderControlSnapshot,
  type AuthProviderEvidenceGateId,
} from "@/lib/admin-auth-provider-control-plane";
import type { FeatureFlag } from "@/lib/feature-flags";

const LAUNCH_SAFE_FLAGS: Record<FeatureFlag, boolean> = {
  "academy.enabled": true,
  "exchange.enabled": false,
  "social.enabled": false,
  "mentor.enabled": true,
  "future.marketplace.enabled": false,
};

const SOCIAL_LOGIN_REVIEW_FLAGS: Record<FeatureFlag, boolean> = {
  ...LAUNCH_SAFE_FLAGS,
  "social.enabled": true,
};

const COMPLETE_EVIDENCE: Record<AuthProviderEvidenceGateId, boolean> = {
  client_registered: true,
  redirect_uri_allowlisted: true,
  secret_stored_server_side: true,
  domain_verified: true,
  account_linking_policy: true,
  audit_rotation_policy: true,
};

describe("admin auth provider control plane", () => {
  it("keeps Google and Apple locked in the launch-safe baseline", () => {
    const snapshot = resolveAuthProviderControlSnapshot({
      featureFlags: LAUNCH_SAFE_FLAGS,
      now: new Date("2026-08-14T12:00:00.000Z"),
    });

    assert.equal(snapshot.generatedAt, "2026-08-14T12:00:00.000Z");
    assert.equal(snapshot.summary.totalProviders, 5);
    assert.equal(snapshot.providers.find((provider) => provider.id === "passkey")?.status, "configured");

    for (const id of ["google", "apple"] as const) {
      const provider = snapshot.providers.find((item) => item.id === id);
      assert.ok(provider, `${id} provider must exist`);
      assert.equal(provider.status, "locked");
      assert.equal(provider.adminLocked, true);
      assert.equal(provider.readinessPercent, 0);
      assert.equal(provider.missingGateIds.length, 6);
      assert.ok(provider.stepUpRequired);
    }

    assert.match(snapshot.safetyCopyFa, /Secret سمت سرور/);
  });

  it("rejects enable requests until feature flag and every evidence gate are ready", () => {
    const locked = evaluateAuthProviderUpdate({
      providerId: "google",
      requestedState: "enabled",
      featureFlags: LAUNCH_SAFE_FLAGS,
    });

    assert.equal(locked.ok, false);
    assert.equal(locked.error, "auth_provider_control_locked");
    assert.equal(locked.httpStatus, 423);
    assert.equal(locked.missingGateIds.length, 6);

    const partial = evaluateAuthProviderUpdate({
      providerId: "apple",
      requestedState: "enabled",
      featureFlags: SOCIAL_LOGIN_REVIEW_FLAGS,
      evidence: { client_registered: true },
    });

    assert.equal(partial.ok, false);
    assert.equal(partial.error, "auth_provider_control_locked");
    assert.ok(partial.missingGateIds.includes("secret_stored_server_side"));
  });

  it("accepts only a review decision after all evidence gates pass", () => {
    const decision = evaluateAuthProviderUpdate({
      providerId: "google",
      requestedState: "enabled",
      featureFlags: SOCIAL_LOGIN_REVIEW_FLAGS,
      evidence: COMPLETE_EVIDENCE,
    });

    assert.deepEqual(decision, {
      ok: true,
      providerId: "google",
      requestedState: "enabled",
      status: "accepted_for_review",
    });
  });

  it("keeps passkey provider read-only from this mutation surface", () => {
    const decision = evaluateAuthProviderUpdate({
      providerId: "passkey",
      requestedState: "disabled",
      featureFlags: SOCIAL_LOGIN_REVIEW_FLAGS,
      evidence: COMPLETE_EVIDENCE,
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.error, "auth_provider_read_only");
  });
});
