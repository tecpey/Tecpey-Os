import { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import {
  fingerprintCommunityProfilePrincipal,
  loadOwnedCommunityProfile,
  loadPublicCommunityProfile,
  updateCommunityProfileConsent,
  type CommunityConsentSettings,
} from "@/lib/community-profile-authority";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { PLATFORM } from "@/lib/platform-config";
import { rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

export const dynamic = "force-dynamic";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const PATCH_FIELDS = new Set([
  "expectedRevision",
  "profileVisibility",
  "leaderboardVisible",
  "journalSharingEnabled",
  "instructorReviewConsent",
  "challengeParticipation",
  "studyGroupDiscovery",
]);

function noStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function parseConsentPatch(value: unknown):
  | { ok: true; expectedRevision: number; consent: CommunityConsentSettings }
  | { ok: false } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false };
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !PATCH_FIELDS.has(key))) {
    return { ok: false };
  }
  if (
    !Number.isInteger(body.expectedRevision) ||
    Number(body.expectedRevision) < 0 ||
    (body.profileVisibility !== "private" && body.profileVisibility !== "public") ||
    typeof body.leaderboardVisible !== "boolean" ||
    typeof body.journalSharingEnabled !== "boolean" ||
    typeof body.instructorReviewConsent !== "boolean" ||
    typeof body.challengeParticipation !== "boolean" ||
    typeof body.studyGroupDiscovery !== "boolean"
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    expectedRevision: Number(body.expectedRevision),
    consent: {
      profileVisibility: body.profileVisibility,
      leaderboardVisible: body.leaderboardVisible,
      journalSharingEnabled: body.journalSharingEnabled,
      instructorReviewConsent: body.instructorReviewConsent,
      challengeParticipation: body.challengeParticipation,
      studyGroupDiscovery: body.studyGroupDiscovery,
    },
  };
}

export async function GET(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/community/profile GET" },
    async () => {
      const publicIdentifier = new URL(req.url).searchParams.get("id")?.trim();
      if (publicIdentifier) {
        const limited = await rateLimit(req, {
          namespace: "community-profile-public-read",
          limit: 60,
          windowMs: 60_000,
        });
        if (!limited.ok) return noStore(apiError("rate_limited", 429));

        const loaded = await loadPublicCommunityProfile({
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
          identifier: publicIdentifier,
        });
        if (!loaded.available) {
          return noStore(apiError("community_profile_unavailable", 503));
        }
        if (!loaded.profile) return noStore(apiError("profile_not_found", 404));
        return noStore(apiOk({ authenticated: false, profile: loaded.profile }));
      }

      const session = await getCanonicalSession(req, { strictRevocation: true });
      if (!session.studentId) {
        return noStore(apiError("academy_profile_required", 401));
      }
      const limited = await rateLimit(req, {
        namespace: "community-profile-self-read",
        identity: session.studentId,
        limit: 60,
        windowMs: 60_000,
      });
      if (!limited.ok) return noStore(apiError("rate_limited", 429));

      const tenantContext = await resolveTenantPrincipalContext({
        session,
        requiredPrincipalType: "student",
        scopes: ["community:profile:read"],
        requestId: resolveSensitiveAuditCorrelation(
          req.headers.get("x-tecpey-request-id"),
        ),
      });
      if (!tenantContext.available) {
        return noStore(apiError("community_profile_unavailable", 503));
      }
      const loaded = await loadOwnedCommunityProfile(tenantContext);
      if (!loaded.available) {
        return noStore(apiError("community_profile_unavailable", 503));
      }
      if (!loaded.profile) return noStore(apiError("profile_not_found", 404));
      return noStore(apiOk({ authenticated: true, profile: loaded.profile }));
    },
  );
}

export async function PATCH(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/community/profile PATCH" },
    async () => {
      if (!verifyCsrfOrigin(req)) return noStore(apiError("forbidden", 403));
      const session = await getCanonicalSession(req, { strictRevocation: true });
      if (!session.studentId) {
        return noStore(apiError("academy_profile_required", 401));
      }
      const limited = await rateLimit(req, {
        namespace: "community-profile-write",
        identity: session.studentId,
        limit: 10,
        windowMs: 60_000,
      });
      if (!limited.ok) return noStore(apiError("rate_limited", 429));

      const idempotencyKey = req.headers.get("idempotency-key")?.trim() ?? "";
      if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
        return noStore(apiError("idempotency_key_required", 400));
      }
      const bounded = await readBoundedJsonRequest(req, { maxBytes: 2_048 });
      if (!bounded.ok) return noStore(apiError(bounded.error, bounded.status));
      const parsed = parseConsentPatch(bounded.value);
      if (!parsed.ok) return noStore(apiError("invalid_community_profile_consent", 400));

      const tenantContext = await resolveTenantPrincipalContext({
        session,
        requiredPrincipalType: "student",
        scopes: ["community:profile:write"],
        requestId: idempotencyKey,
      });
      if (!tenantContext.available) {
        return noStore(apiError("community_profile_unavailable", 503));
      }
      const principalFingerprint = fingerprintCommunityProfilePrincipal({
        tenantId: tenantContext.tenantId,
        principalId: tenantContext.principalId,
      });
      const updated = await updateCommunityProfileConsent({
        context: tenantContext,
        expectedRevision: parsed.expectedRevision,
        consent: parsed.consent,
        audit: {
          tenantId: tenantContext.tenantId,
          actorType: "student",
          actorId: tenantContext.principalId,
          correlationId: idempotencyKey,
          requestHash: hashSensitiveAuditRequest({
            tenantId: tenantContext.tenantId,
            workspaceId: tenantContext.workspaceId,
            action: "community.profile.consent.update",
            principalFingerprint,
            expectedRevision: parsed.expectedRevision,
            consent: parsed.consent,
          }),
        },
      });
      if (!updated.ok) {
        if (updated.reason === "not_found") {
          return noStore(apiError("profile_not_found", 404));
        }
        if (updated.reason === "revision_conflict") {
          return noStore(apiError("community_profile_revision_conflict", 409));
        }
        if (updated.reason === "idempotency_conflict") {
          return noStore(apiError("idempotency_conflict", 409));
        }
        return noStore(apiError("community_profile_unavailable", 503));
      }

      return noStore(
        apiOk({
          profile: updated.profile,
          changed: updated.changed,
          replayed: updated.replayed,
        }),
      );
    },
  );
}
