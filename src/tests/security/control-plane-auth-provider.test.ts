import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  evaluateAuthProviderUpdate,
  resolveAuthProviderControlSnapshot,
  type AuthProviderEvidenceGateId,
} from "@/lib/admin-auth-provider-control-plane";
import {
  evidenceByProviderFromRows,
  normalizeAuthProviderEvidenceMutation,
} from "@/lib/admin-auth-provider-evidence-store";
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

      const enableAction = provider.adminActions.find((action) => action.id === "request_enable");
      assert.equal(enableAction?.enabled, false);
      assert.equal(enableAction?.locked, true);
      assert.match(enableAction?.disabledReasonFa ?? "", /social\.enabled/);

      const setupAction = provider.adminActions.find((action) => action.id === "open_setup");
      assert.equal(setupAction?.enabled, true);
    }

    assert.match(snapshot.safetyCopyFa, /Secret سمت سرور/);
  });

  it("describes provider configuration fields without exposing secret values", () => {
    const snapshot = resolveAuthProviderControlSnapshot({
      featureFlags: LAUNCH_SAFE_FLAGS,
      now: new Date("2026-08-14T12:00:00.000Z"),
    });
    const google = snapshot.providers.find((provider) => provider.id === "google");
    const apple = snapshot.providers.find((provider) => provider.id === "apple");

    assert.ok(google);
    assert.ok(apple);

    const googleSecret = google.configurationFields.find((field) => field.id === "client_secret_ref");
    const applePrivateKey = apple.configurationFields.find((field) => field.id === "private_key_ref");

    for (const field of [googleSecret, applePrivateKey]) {
      assert.ok(field);
      assert.equal(field.storage, "secret_store");
      assert.equal(field.masked, true);
      assert.equal(field.status, "missing");
      assert.equal("value" in field, false);
    }
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

    const snapshot = resolveAuthProviderControlSnapshot({
      featureFlags: SOCIAL_LOGIN_REVIEW_FLAGS,
      evidenceByProvider: { google: COMPLETE_EVIDENCE },
    });
    const google = snapshot.providers.find((provider) => provider.id === "google");
    const enableAction = google?.adminActions.find((action) => action.id === "request_enable");

    assert.equal(google?.status, "planned");
    assert.equal(google?.adminLocked, false);
    assert.equal(google?.configurationFields.every((field) => field.status === "configured"), true);
    assert.equal(enableAction?.enabled, true);
    assert.equal(enableAction?.disabledReasonFa, null);
  });

  it("uses runtime feature flags consistently when an API caller does not inject them", () => {
    const previousSocialFlag = process.env.FEATURE_SOCIAL_ENABLED;
    process.env.FEATURE_SOCIAL_ENABLED = "true";

    try {
      const decision = evaluateAuthProviderUpdate({
        providerId: "google",
        requestedState: "enabled",
        evidence: COMPLETE_EVIDENCE,
      });

      assert.equal(decision.ok, true);
    } finally {
      if (previousSocialFlag === undefined) {
        delete process.env.FEATURE_SOCIAL_ENABLED;
      } else {
        process.env.FEATURE_SOCIAL_ENABLED = previousSocialFlag;
      }
    }
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

  it("keeps supplemental providers admin-locked until implementation sign-off", () => {
    const snapshot = resolveAuthProviderControlSnapshot({
      featureFlags: SOCIAL_LOGIN_REVIEW_FLAGS,
      evidenceByProvider: {
        telegram: COMPLETE_EVIDENCE,
        email_otp: COMPLETE_EVIDENCE,
      },
    });

    for (const id of ["telegram", "email_otp"] as const) {
      const provider = snapshot.providers.find((item) => item.id === id);
      assert.ok(provider, `${id} provider must exist`);
      assert.equal(provider.status, "planned");
      assert.equal(provider.adminLocked, true);
      assert.equal(provider.missingGateIds.length, 0);
      assert.equal(provider.configurationFields.every((field) => field.status === "configured"), true);

      const enableAction = provider.adminActions.find((action) => action.id === "request_enable");
      assert.equal(enableAction?.enabled, false);
      assert.match(enableAction?.disabledReasonFa ?? "", /sign-off/);
    }
  });

  it("builds provider evidence only from ready unexpired server rows", () => {
    const evidence = evidenceByProviderFromRows([
      {
        provider_id: "google",
        gate_id: "client_registered",
        evidence_state: "ready",
        expires_at: null,
      },
      {
        provider_id: "google",
        gate_id: "secret_stored_server_side",
        evidence_state: "ready",
        expires_at: "2026-08-13T00:00:00.000Z",
      },
      {
        provider_id: "apple",
        gate_id: "client_registered",
        evidence_state: "rejected",
        expires_at: null,
      },
      {
        provider_id: "passkey",
        gate_id: "client_registered",
        evidence_state: "ready",
        expires_at: null,
      },
      {
        provider_id: "google",
        gate_id: "unknown_gate",
        evidence_state: "ready",
        expires_at: null,
      },
    ], new Date("2026-08-14T00:00:00.000Z"));

    assert.deepEqual(evidence, {
      google: {
        client_registered: true,
      },
    });
  });

  it("validates evidence mutations without accepting raw secret-like input", () => {
    const ready = normalizeAuthProviderEvidenceMutation({
      tenantId: "tecpey",
      workspaceId: "main",
      actorAdminId: "00000000-0000-4000-8000-000000000001",
      providerId: "google",
      gateId: "secret_stored_server_side",
      action: "mark_ready",
      evidenceRef: "vault://oauth/google/client-secret",
      evidenceSha256: "a".repeat(64),
      expiresAt: "2026-12-31T23:59:00.000Z",
    }, new Date("2026-08-14T00:00:00.000Z"));

    if ("ok" in ready) assert.fail("ready evidence mutation should normalize successfully");
    assert.equal(ready.providerId, "google");
    assert.equal(ready.evidenceState, "ready");
    assert.equal(ready.evidenceSha256, "a".repeat(64));
    assert.equal(ready.expiresAt, "2026-12-31T23:59:00.000Z");
    assert.match(ready.requestHash, /^[0-9a-f]{64}$/);

    const rawSecret = normalizeAuthProviderEvidenceMutation({
      tenantId: "tecpey",
      workspaceId: "main",
      actorAdminId: "00000000-0000-4000-8000-000000000001",
      providerId: "google",
      gateId: "secret_stored_server_side",
      action: "mark_ready",
      evidenceRef: "secret=super-raw-value",
      evidenceSha256: "a".repeat(64),
    });

    if (!("ok" in rawSecret)) assert.fail("raw secret-like evidence mutation must fail");
    assert.equal(rawSecret.ok, false);
    assert.equal(rawSecret.error, "auth_provider_evidence_secret_like_input");
  });

  it("requires reasons for non-ready evidence decisions and rejects passkey mutation", () => {
    const missingReason = normalizeAuthProviderEvidenceMutation({
      tenantId: "tecpey",
      workspaceId: "main",
      actorAdminId: "00000000-0000-4000-8000-000000000001",
      providerId: "apple",
      gateId: "redirect_uri_allowlisted",
      action: "reject",
    });

    if (!("ok" in missingReason)) assert.fail("missing reason evidence mutation must fail");
    assert.equal(missingReason.ok, false);
    assert.equal(missingReason.error, "auth_provider_evidence_reason_required");

    const passkey = normalizeAuthProviderEvidenceMutation({
      tenantId: "tecpey",
      workspaceId: "main",
      actorAdminId: "00000000-0000-4000-8000-000000000001",
      providerId: "passkey",
      gateId: "client_registered",
      action: "mark_missing",
      decisionNote: "read only surface",
    });

    if (!("ok" in passkey)) assert.fail("passkey evidence mutation must fail");
    assert.equal(passkey.ok, false);
    assert.equal(passkey.error, "invalid_auth_provider_evidence_request");
  });

  it("guards the provider evidence write route with manage permission and fresh step-up", async () => {
    const route = await readFile("src/app/api/command-center/auth-providers/route.ts", "utf8");
    const patchStart = route.indexOf("export async function PATCH");
    assert.ok(patchStart >= 0, "PATCH evidence route must exist");
    const patchRoute = route.slice(patchStart);

    assert.match(patchRoute, /namespace: "command-center-auth-providers-evidence-write"/);
    assert.match(
      patchRoute,
      /authorizeAdminRequest\(req, "admin\.roles\.manage", \{[\s\S]*stepUpWithinSeconds: 300,[\s\S]*\}\)/,
    );
    assert.match(patchRoute, /tenantId: authorization\.principal\.tenantId/);
    assert.match(patchRoute, /workspaceId: authorization\.principal\.workspaceId/);
    assert.match(patchRoute, /actorAdminId: authorization\.principal\.adminId/);
    assert.match(patchRoute, /applyAuthProviderEvidenceMutation\(\{/);
    assert.doesNotMatch(patchRoute, /clientSecret|privateKey|botToken|apiKey/);
  });
});
