import { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import {
  claimJournalChallenge,
  JOURNAL_REFLECTION_CHALLENGE_ID,
  loadJournalChallengeStatus,
} from "@/lib/community-journal-challenge-authority";
import {
  listCommunityJournalFeed,
  parseCommunityJournalCursor,
} from "@/lib/community-journal-authority";
import {
  fingerprintCommunityProfilePrincipal,
  loadOwnedCommunityProfile,
  loadPublicCommunityProfile,
  updateCommunityProfileConsent,
  type CommunityConsentSettings,
} from "@/lib/community-profile-authority";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
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
const CHALLENGE_CLAIM_FIELDS = new Set(["challengeId", "weekKey"]);

function noStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

function parseFeedLimit(value: string | null): number | null {
  if (!value) return 20;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : null;
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

function parseChallengeClaim(value: unknown):
  | { ok: true; challengeId: string; weekKey: string }
  | { ok: false } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false };
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).length !== CHALLENGE_CLAIM_FIELDS.size ||
    Object.keys(body).some((key) => !CHALLENGE_CLAIM_FIELDS.has(key)) ||
    body.challengeId !== JOURNAL_REFLECTION_CHALLENGE_ID ||
    typeof body.weekKey !== "string" ||
    !/^\d{4}-cycle-\d{2,3}$/.test(body.weekKey)
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    challengeId: body.challengeId,
    weekKey: body.weekKey,
  };
}

export async function GET(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/community/profile GET" },
    async () => {
      const searchParams = new URL(req.url).searchParams;
      const publicIdentifier = searchParams.get("id")?.trim();
      const view = searchParams.get("view")?.trim() ?? "profile";

      if (publicIdentifier) {
        if (view !== "profile" || searchParams.has("cursor") || searchParams.has("limit")) {
          return noStore(apiError("invalid_community_profile_view", 400));
        }
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

      if (
        view !== "profile" &&
        view !== "journal-feed" &&
        view !== "challenge-center"
      ) {
        return noStore(apiError("invalid_community_profile_view", 400));
      }

      const session = await getCanonicalSession(req, { strictRevocation: true });
      if (!session.studentId) {
        return noStore(apiError("academy_profile_required", 401));
      }

      if (view === "journal-feed") {
        const limited = await rateLimit(req, {
          namespace: "community-journal-feed",
          identity: session.studentId,
          limit: 60,
          windowMs: 60_000,
        });
        if (!limited.ok) return noStore(apiError("rate_limited", 429));

        const limit = parseFeedLimit(searchParams.get("limit"));
        if (!limit) return noStore(apiError("invalid_limit", 400));
        const parsedCursor = parseCommunityJournalCursor(searchParams.get("cursor"));
        if (!parsedCursor.ok) {
          return noStore(apiError("invalid_community_journal_cursor", 400));
        }

        const journalContext = await resolveTenantPrincipalContext({
          session,
          requiredPrincipalType: "student",
          scopes: ["community:journal:read"],
          requestId: resolveSensitiveAuditCorrelation(
            req.headers.get("x-tecpey-request-id"),
          ),
        });
        if (!journalContext.available) {
          return noStore(apiError("community_journal_unavailable", 503));
        }
        const feed = await listCommunityJournalFeed({
          context: journalContext,
          cursor: parsedCursor.cursor,
          limit,
        });
        if (!feed.available) {
          return noStore(apiError("community_journal_unavailable", 503));
        }
        return noStore(apiOk(feed.page));
      }

      if (view === "challenge-center") {
        if (searchParams.has("cursor") || searchParams.has("limit")) {
          return noStore(apiError("invalid_community_profile_view", 400));
        }
        const limited = await rateLimit(req, {
          namespace: "community-challenge-read",
          identity: session.studentId,
          limit: 60,
          windowMs: 60_000,
        });
        if (!limited.ok) return noStore(apiError("rate_limited", 429));
        const challengeContext = await resolveTenantPrincipalContext({
          session,
          requiredPrincipalType: "student",
          scopes: ["community:challenge:read"],
          requestId: resolveSensitiveAuditCorrelation(
            req.headers.get("x-tecpey-request-id"),
          ),
        });
        if (!challengeContext.available) {
          return noStore(apiError("community_challenge_unavailable", 503));
        }
        const loaded = await loadJournalChallengeStatus({ context: challengeContext });
        if (!loaded.available) {
          return noStore(apiError("community_challenge_unavailable", 503));
        }
        return noStore(apiOk({ challenge: loaded.status }));
      }

      if (searchParams.has("cursor") || searchParams.has("limit")) {
        return noStore(apiError("invalid_community_profile_view", 400));
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

      const searchParams = new URL(req.url).searchParams;
      const view = searchParams.get("view")?.trim() ?? "profile";
      if (view !== "profile" && view !== "journal-challenge") {
        return noStore(apiError("invalid_community_profile_view", 400));
      }
      if (
        [...searchParams.keys()].some((key) => key !== "view") ||
        (view === "profile" && searchParams.has("view"))
      ) {
        return noStore(apiError("invalid_community_profile_view", 400));
      }

      if (view === "journal-challenge") {
        const challengeLimited = await rateLimit(req, {
          namespace: "community-journal-challenge-claim",
          identity: session.studentId,
          limit: 12,
          windowMs: 60_000,
        });
        if (!challengeLimited.ok) return noStore(apiError("rate_limited", 429));
      } else {
        const profileLimited = await rateLimit(req, {
          namespace: "community-profile-write",
          identity: session.studentId,
          limit: 10,
          windowMs: 60_000,
        });
        if (!profileLimited.ok) return noStore(apiError("rate_limited", 429));
      }

      const idempotencyKey = req.headers.get("idempotency-key")?.trim() ?? "";
      if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
        return noStore(apiError("idempotency_key_required", 400));
      }
      const bounded = await readBoundedJsonRequest(req, {
        maxBytes: view === "journal-challenge" ? 1_024 : 2_048,
      });
      if (!bounded.ok) return noStore(apiError(bounded.error, bounded.status));

      if (view === "journal-challenge") {
        const parsed = parseChallengeClaim(bounded.value);
        if (!parsed.ok) {
          return noStore(apiError("invalid_community_challenge_claim", 400));
        }
        const challengeContext = await resolveTenantPrincipalContext({
          session,
          requiredPrincipalType: "student",
          scopes: ["community:challenge:write"],
          requestId: idempotencyKey,
        });
        if (!challengeContext.available) {
          return noStore(apiError("community_challenge_unavailable", 503));
        }
        const principalFingerprint = fingerprintCommunityProfilePrincipal({
          tenantId: challengeContext.tenantId,
          principalId: challengeContext.principalId,
        });
        const claimed = await claimJournalChallenge({
          context: challengeContext,
          challengeId: parsed.challengeId,
          weekKey: parsed.weekKey,
          idempotencyKey,
          audit: {
            tenantId: challengeContext.tenantId,
            actorType: "student",
            actorId: challengeContext.principalId,
            correlationId: idempotencyKey,
            requestHash: hashSensitiveAuditRequest({
              tenantId: challengeContext.tenantId,
              workspaceId: challengeContext.workspaceId,
              action: "community.challenge.reward.claim",
              principalFingerprint,
              challengeId: parsed.challengeId,
              weekKey: parsed.weekKey,
            }),
          },
        });
        if (!claimed.ok) {
          if (claimed.reason === "inactive") {
            return noStore(apiError("community_challenge_inactive", 409, claimed.status));
          }
          if (claimed.reason === "consent_required") {
            return noStore(apiError("community_challenge_consent_required", 409, claimed.status));
          }
          if (claimed.reason === "not_eligible") {
            return noStore(apiError("community_challenge_not_eligible", 409, claimed.status));
          }
          if (claimed.reason === "idempotency_conflict") {
            return noStore(apiError("idempotency_conflict", 409));
          }
          return noStore(apiError("community_challenge_unavailable", 503));
        }
        if (claimed.changed) {
          scheduleMentorProfileUpdate(session.studentId, "community_challenge_completed");
        }
        return noStore(
          apiOk({
            challenge: claimed.status,
            progress: claimed.progress,
            progressRevision: claimed.progressRevision,
            changed: claimed.changed,
            replayed: claimed.replayed,
          }),
        );
      }

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
