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
  normalizeAuthProviderReviewDecision,
  reviewRequestsByProviderFromRows,
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

  it("builds provider review queues only from scoped approval rows", () => {
    const scoped = reviewRequestsByProviderFromRows([
      {
        id: "review-google-1",
        action: "auth_provider.request_enable",
        resource_id: "tecpey/main/google",
        payload: {
          tenantId: "tecpey",
          workspaceId: "main",
          providerId: "google",
          requestedState: "enabled",
        },
        reason: "ready for independent security review",
        status: "pending",
        requested_by: "00000000-0000-4000-8000-000000000001",
        reviewed_by: null,
        requested_at: "2026-08-14T12:00:00.000Z",
        reviewed_at: null,
        expires_at: "2026-08-21T12:00:00.000Z",
        executed_at: null,
        audit_event_id: "audit-1",
        audit_event_hash: "a".repeat(64),
      },
      {
        id: "cross-tenant-google",
        action: "auth_provider.request_enable",
        resource_id: "tecpey/main/google",
        payload: {
          tenantId: "other-tenant",
          workspaceId: "main",
          providerId: "google",
          requestedState: "enabled",
        },
        reason: "must not leak into this tenant queue",
        status: "pending",
        requested_by: "00000000-0000-4000-8000-000000000002",
        reviewed_by: null,
        requested_at: "2026-08-14T12:01:00.000Z",
        reviewed_at: null,
        expires_at: "2026-08-21T12:01:00.000Z",
        executed_at: null,
        audit_event_id: "audit-2",
        audit_event_hash: "b".repeat(64),
      },
      {
        id: "passkey-review",
        action: "auth_provider.request_disable",
        resource_id: "tecpey/main/passkey",
        payload: {
          tenantId: "tecpey",
          workspaceId: "main",
          providerId: "passkey",
          requestedState: "disabled",
        },
        reason: "passkey is read-only from this surface",
        status: "pending",
        requested_by: "00000000-0000-4000-8000-000000000003",
        reviewed_by: null,
        requested_at: "2026-08-14T12:02:00.000Z",
        reviewed_at: null,
        expires_at: "2026-08-21T12:02:00.000Z",
        executed_at: null,
        audit_event_id: null,
        audit_event_hash: null,
      },
    ], { tenantId: "tecpey", workspaceId: "main" });

    assert.deepEqual(scoped.google, [
      {
        id: "review-google-1",
        providerId: "google",
        requestedState: "enabled",
        action: "auth_provider.request_enable",
        status: "pending",
        reason: "ready for independent security review",
        requestedByAdminId: "00000000-0000-4000-8000-000000000001",
        reviewedByAdminId: null,
        requestedAt: "2026-08-14T12:00:00.000Z",
        reviewedAt: null,
        expiresAt: "2026-08-21T12:00:00.000Z",
        executedAt: null,
        auditEventId: "audit-1",
        auditEventHash: "a".repeat(64),
      },
    ]);
    assert.equal(scoped.passkey, undefined);
  });

  it("validates auth-provider review decisions before database access", () => {
    const valid = normalizeAuthProviderReviewDecision({
      tenantId: "tecpey",
      workspaceId: "main",
      actorAdminId: "00000000-0000-4000-8000-000000000001",
      sessionId: null,
      effectiveRoles: ["super_admin"],
      approvalRequestId: "11111111-1111-4111-8111-111111111111",
      decision: "approve",
      decisionNote: "independent reviewer verified the provider evidence package",
    });

    if ("ok" in valid) assert.fail("valid provider review decision should normalize successfully");
    assert.equal(valid.status, "approved");
    assert.match(valid.requestHash, /^[0-9a-f]{64}$/);

    const shortNote = normalizeAuthProviderReviewDecision({
      tenantId: "tecpey",
      workspaceId: "main",
      actorAdminId: "00000000-0000-4000-8000-000000000001",
      sessionId: null,
      effectiveRoles: ["super_admin"],
      approvalRequestId: "11111111-1111-4111-8111-111111111111",
      decision: "reject",
      decisionNote: "no",
    });
    if (!("ok" in shortNote)) assert.fail("short provider review note must fail");
    assert.equal(shortNote.error, "auth_provider_review_decision_reason_required");

    const invalidUuid = normalizeAuthProviderReviewDecision({
      tenantId: "tecpey",
      workspaceId: "main",
      actorAdminId: "00000000-0000-4000-8000-000000000001",
      sessionId: null,
      effectiveRoles: ["super_admin"],
      approvalRequestId: "not-a-uuid",
      decision: "approve",
      decisionNote: "independent reviewer verified the provider evidence package",
    });
    if (!("ok" in invalidUuid)) assert.fail("invalid approval UUID must fail");
    assert.equal(invalidUuid.error, "invalid_auth_provider_review_decision_request");

    const secretLikeNote = normalizeAuthProviderReviewDecision({
      tenantId: "tecpey",
      workspaceId: "main",
      actorAdminId: "00000000-0000-4000-8000-000000000001",
      sessionId: null,
      effectiveRoles: ["super_admin"],
      approvalRequestId: "11111111-1111-4111-8111-111111111111",
      decision: "approve",
      decisionNote: "secret=raw-provider-value must not be accepted",
    });
    if (!("ok" in secretLikeNote)) assert.fail("secret-like review note must fail");
    assert.equal(secretLikeNote.error, "auth_provider_review_decision_secret_like_input");
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

    const shortReadyNote = normalizeAuthProviderEvidenceMutation({
      tenantId: "tecpey",
      workspaceId: "main",
      actorAdminId: "00000000-0000-4000-8000-000000000001",
      providerId: "google",
      gateId: "secret_stored_server_side",
      action: "mark_ready",
      evidenceRef: "vault://oauth/google/client-secret",
      evidenceSha256: "a".repeat(64),
      decisionNote: "ok",
    });

    if (!("ok" in shortReadyNote)) assert.fail("short ready note must fail before database insert");
    assert.equal(shortReadyNote.ok, false);
    assert.equal(shortReadyNote.error, "auth_provider_evidence_reason_required");
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
    const decisionRoute = await readFile("src/app/api/command-center/auth-providers/review-requests/route.ts", "utf8");
    const getStart = route.indexOf("export async function GET");
    const patchStart = route.indexOf("export async function PATCH");
    const postStart = route.indexOf("export async function POST");
    assert.ok(getStart >= 0, "GET provider read route must exist");
    assert.ok(postStart >= 0, "POST provider review route must exist");
    assert.ok(patchStart >= 0, "PATCH evidence route must exist");
    const getRoute = route.slice(getStart, postStart);
    const patchRoute = route.slice(patchStart);

    assert.match(getRoute, /authorizeAdminRequest\(req, "admin\.roles\.read"\)/);
    assert.match(getRoute, /loadAuthProviderReviewRequestsByProvider\(\{/);
    assert.match(getRoute, /reviewRequestsByProvider/);

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

    const postRoute = route.slice(postStart, patchStart);
    assert.match(postRoute, /submitAuthProviderReviewRequest\(\{/);
    assert.match(postRoute, /sessionId: authorization\.principal\.sessionId/);
    assert.match(postRoute, /effectiveRoles: authorization\.principal\.roles/);
    assert.match(postRoute, /reviewRequest/);

    assert.match(decisionRoute, /namespace: "command-center-auth-provider-review-decision-write"/);
    assert.match(
      decisionRoute,
      /authorizeAdminRequest\(req, "admin\.roles\.manage", \{[\s\S]*stepUpWithinSeconds: 300,[\s\S]*\}\)/,
    );
    assert.match(decisionRoute, /readBoundedJsonRequest\(req, \{ maxBytes: 8_192 \}\)/);
    assert.match(decisionRoute, /tenantId: authorization\.principal\.tenantId/);
    assert.match(decisionRoute, /workspaceId: authorization\.principal\.workspaceId/);
    assert.match(decisionRoute, /actorAdminId: authorization\.principal\.adminId/);
    assert.match(decisionRoute, /decideAuthProviderReviewRequest\(\{/);
    assert.doesNotMatch(decisionRoute, /clientSecret|privateKey|botToken|apiKey/);
  });

  it("keeps auth-provider evidence reads and writes tenant/workspace scoped", async () => {
    const store = await readFile("src/lib/admin-auth-provider-evidence-store.ts", "utf8");

    assert.match(
      store,
      /FROM admin_auth_provider_evidence\s+WHERE tenant_id = \$1\s+AND workspace_id = \$2\s+AND evidence_state = 'ready'/,
    );
    assert.match(
      store,
      /INSERT INTO admin_auth_provider_evidence\s+[\s\S]*ON CONFLICT \(tenant_id, workspace_id, provider_id, gate_id\)/,
    );
    assert.match(
      store,
      /INSERT INTO admin_auth_provider_evidence_events\s+[\s\S]*\(tenant_id, workspace_id, provider_id, gate_id, action, actor_admin_id,/,
    );
    assert.match(
      store,
      /FROM admin_approval_requests request[\s\S]*left\(request\.resource_id, length\(\$1\)\) = \$1[\s\S]*request\.payload ->> 'tenantId' = \$2[\s\S]*request\.payload ->> 'workspaceId' = \$3/,
    );
    assert.match(
      store,
      /WHERE request\.id = \$1::uuid[\s\S]*request\.resource_type = 'auth_provider'[\s\S]*left\(request\.resource_id, length\(\$2\)\) = \$2[\s\S]*request\.payload ->> 'tenantId' = \$3[\s\S]*request\.payload ->> 'workspaceId' = \$4[\s\S]*FOR UPDATE/,
    );
    assert.match(store, /requested_by <> \$3::uuid/);
    assert.match(store, /auth_provider_review_request_self_review_forbidden/);
    assert.match(store, /outcome: "denied"/);
    assert.doesNotMatch(store, /FROM admin_auth_provider_evidence\s+WHERE provider_id = \$1/);
    assert.doesNotMatch(store, /ON CONFLICT \(provider_id, gate_id\)/);
    assert.doesNotMatch(store, /FROM admin_approval_requests request\s+WHERE request\.resource_id = \$1/);
  });
});
