import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { cleanText } from "@/lib/student-cartax";
import { withDb, withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { AvailableTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveMutationAuditEvent,
} from "@/lib/security/sensitive-mutation-audit";

export const COMMUNITY_PROFILE_CONSENT_VERSION = "community-profile-consent-v1";
export const COMMUNITY_PROFILE_POLICY_VERSION = "community-profile-authority-v1";

export type CommunityProfileVisibility = "private" | "public";

export type CommunityConsentSettings = {
  profileVisibility: CommunityProfileVisibility;
  leaderboardVisible: boolean;
  journalSharingEnabled: boolean;
  instructorReviewConsent: boolean;
  challengeParticipation: boolean;
  studyGroupDiscovery: boolean;
};

export type CommunityPublicProfile = {
  publicProfileId: string;
  publicStudentId: string;
  displayName: string;
  username: string;
  avatar: string;
  level: string;
  currentTerm: number;
  xp: number;
  streak: number;
  achievementsCount: number;
  certificatesCount: number;
  mentorScore: number;
  arenaScore: number;
  careerScore: number;
  tradingStyle: string;
  visibility: CommunityProfileVisibility;
  strengths: string[];
  growthAreas: string[];
  updatedAt: string;
};

export type CommunityOwnedProfile = CommunityPublicProfile & {
  revision: number;
  consentVersion: string;
  consentedAt: string | null;
  consent: CommunityConsentSettings;
};

export type CommunityProfileLoadResult<T> =
  | { available: true; profile: T | null }
  | { available: false; profile: null };

export type CommunityConsentAuditContext = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "actorType" | "actorId" | "correlationId" | "requestHash"
>;

export type CommunityConsentUpdateResult =
  | {
      ok: true;
      changed: boolean;
      replayed: boolean;
      profile: CommunityOwnedProfile;
    }
  | {
      ok: false;
      reason:
        | "unavailable"
        | "not_found"
        | "revision_conflict"
        | "idempotency_conflict";
    };

type CommunityProfileRow = {
  student_id: string;
  tenant_id: string;
  workspace_id: string;
  principal_type: "student";
  principal_id: string;
  public_profile_id: string;
  visibility: CommunityProfileVisibility;
  leaderboard_visible: boolean;
  journal_sharing_enabled: boolean;
  instructor_review_consent: boolean;
  challenge_participation: boolean;
  study_group_discovery: boolean;
  revision: string | number;
  consent_version: string;
  consented_at: Date | string | null;
  updated_at: Date | string;
  public_student_id: string | null;
  display_name: string | null;
  username: string | null;
  avatar: string | null;
  streak_days: string | number | null;
  total_xp: string | number | null;
  completed_terms: string | number | null;
  overall_progress: string | number | null;
  earned_badges: unknown;
};

type ExistingConsentAudit = {
  actor_type: string;
  actor_id: string;
  resource_type: string;
  resource_id: string;
  outcome: string;
  request_hash: string;
};

const DEFAULT_CONSENT: CommunityConsentSettings = Object.freeze({
  profileVisibility: "private",
  leaderboardVisible: false,
  journalSharingEnabled: false,
  instructorReviewConsent: false,
  challengeParticipation: false,
  studyGroupDiscovery: false,
});

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function scoreClamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeUsername(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 32);
}

function normalizePublicIdentifier(value: string): string {
  return value
    .trim()
    .replace(/^@/, "")
    .replace(/[^A-Za-z0-9_.-]/g, "")
    .slice(0, 64);
}

function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function rowConsent(row: CommunityProfileRow): CommunityConsentSettings {
  return {
    profileVisibility: row.visibility,
    leaderboardVisible: row.leaderboard_visible,
    journalSharingEnabled: row.journal_sharing_enabled,
    instructorReviewConsent: row.instructor_review_consent,
    challengeParticipation: row.challenge_participation,
    studyGroupDiscovery: row.study_group_discovery,
  };
}

function mapProfile(row: CommunityProfileRow): CommunityOwnedProfile {
  const xp = toNumber(row.total_xp);
  const completedTerms = toNumber(row.completed_terms);
  const overallProgress = toNumber(row.overall_progress);
  const streak = toNumber(row.streak_days);
  const achievementsCount = Array.isArray(row.earned_badges)
    ? row.earned_badges.length
    : 0;
  const mentorScore = scoreClamp(
    45 + completedTerms * 7 + Math.min(20, xp / 100) + Math.min(10, streak),
  );
  // Arena evidence is intentionally unavailable until the verified Arena
  // projection is migrated into this public profile authority.
  const arenaScore = 0;
  const careerScore = scoreClamp((mentorScore + overallProgress) / 2);
  const publicStudentId =
    String(row.public_student_id ?? "").trim() ||
    `TP-PROFILE-${row.public_profile_id
      .replaceAll("-", "")
      .slice(0, 10)
      .toUpperCase()}`;

  return {
    publicProfileId: row.public_profile_id,
    publicStudentId,
    displayName: cleanText(row.display_name, 120) || "دانشجوی تک‌پی",
    username:
      normalizeUsername(row.username) ||
      `learner-${row.public_profile_id.replaceAll("-", "").slice(0, 8)}`,
    avatar: cleanText(row.avatar, 20) || "🟦",
    level:
      completedTerms >= 5
        ? "Advanced Learner"
        : completedTerms >= 2
          ? "Active Learner"
          : "Explorer",
    currentTerm: Math.max(1, completedTerms + 1),
    xp,
    streak,
    achievementsCount,
    certificatesCount: completedTerms,
    mentorScore,
    arenaScore,
    careerScore,
    tradingStyle:
      careerScore >= 80
        ? "مسیر آموزشی پیشرفته"
        : careerScore >= 60
          ? "مسیر آموزشی در حال رشد"
          : "مرحله پایه یادگیری",
    visibility: row.visibility,
    strengths:
      careerScore >= 70
        ? ["استمرار آموزشی", "پیشرفت تأییدشده آکادمی"]
        : ["شروع مسیر یادگیری", "آمادگی برای تمرین ساختاریافته"],
    growthAreas:
      completedTerms < 3
        ? ["تکمیل ترم جاری", "مرور درس‌های پایه مدیریت ریسک"]
        : ["تمرین سرورمحور در Trading Arena", "ثبت ژورنال معتبر"],
    updatedAt: new Date(row.updated_at).toISOString(),
    revision: toNumber(row.revision),
    consentVersion: row.consent_version,
    consentedAt: iso(row.consented_at),
    consent: rowConsent(row),
  };
}

function publicProjection(
  profile: CommunityOwnedProfile,
): CommunityPublicProfile {
  return {
    publicProfileId: profile.publicProfileId,
    publicStudentId: profile.publicStudentId,
    displayName: profile.displayName,
    username: profile.username,
    avatar: profile.avatar,
    level: profile.level,
    currentTerm: profile.currentTerm,
    xp: profile.xp,
    streak: profile.streak,
    achievementsCount: profile.achievementsCount,
    certificatesCount: profile.certificatesCount,
    mentorScore: profile.mentorScore,
    arenaScore: profile.arenaScore,
    careerScore: profile.careerScore,
    tradingStyle: profile.tradingStyle,
    visibility: profile.visibility,
    strengths: profile.strengths,
    growthAreas: profile.growthAreas,
    updatedAt: profile.updatedAt,
  };
}

function sameConsent(
  left: CommunityConsentSettings,
  right: CommunityConsentSettings,
): boolean {
  return (
    left.profileVisibility === right.profileVisibility &&
    left.leaderboardVisible === right.leaderboardVisible &&
    left.journalSharingEnabled === right.journalSharingEnabled &&
    left.instructorReviewConsent === right.instructorReviewConsent &&
    left.challengeParticipation === right.challengeParticipation &&
    left.studyGroupDiscovery === right.studyGroupDiscovery
  );
}

function assertContext(
  context: AvailableTenantPrincipalContext,
  requiredScope: "community:profile:read" | "community:profile:write",
): void {
  if (
    context.principalType !== "student" ||
    !context.principalId ||
    !context.scopes.includes(requiredScope)
  ) {
    throw new Error("community_profile_context_invalid");
  }
}

function assertAudit(
  context: AvailableTenantPrincipalContext,
  audit: CommunityConsentAuditContext,
): void {
  if (
    audit.tenantId !== context.tenantId ||
    audit.actorType !== "student" ||
    audit.actorId !== context.principalId
  ) {
    throw new Error("community_profile_audit_context_mismatch");
  }
}

export function fingerprintCommunityProfilePrincipal(input: {
  tenantId: string;
  principalId: string;
}): string {
  return createHash("sha256")
    .update("tecpey-community-profile-principal-v1\0")
    .update(input.tenantId)
    .update("\0")
    .update(input.principalId)
    .digest("hex");
}

const PROFILE_SELECT = `
  SELECT profile.student_id::text,
         profile.tenant_id,
         profile.workspace_id,
         profile.principal_type,
         profile.principal_id,
         profile.public_profile_id::text,
         profile.visibility,
         profile.leaderboard_visible,
         profile.journal_sharing_enabled,
         profile.instructor_review_consent,
         profile.challenge_participation,
         profile.study_group_discovery,
         profile.revision,
         profile.consent_version,
         profile.consented_at,
         profile.updated_at,
         cartax.public_student_id,
         student.display_name,
         student.username,
         student.avatar,
         cartax.streak_days,
         cartax.total_xp,
         cartax.completed_terms,
         cartax.overall_progress,
         cartax.earned_badges
    FROM academy_public_profiles profile
    JOIN academy_students student
      ON student.id = profile.student_id
    LEFT JOIN academy_student_cartax cartax
      ON cartax.student_id = profile.student_id`;

async function loadOwnedProfileTx(
  client: PoolClient,
  context: AvailableTenantPrincipalContext,
  lock = false,
): Promise<CommunityProfileRow | null> {
  const selected = await client.query<CommunityProfileRow>(
    `${PROFILE_SELECT}
      WHERE profile.tenant_id = $1
        AND profile.workspace_id = $2
        AND profile.principal_type = 'student'
        AND profile.principal_id = $3
      LIMIT 1${lock ? " FOR UPDATE OF profile" : ""}`,
    [context.tenantId, context.workspaceId, context.principalId],
  );
  return selected.rows[0] ?? null;
}

export async function loadOwnedCommunityProfile(
  context: AvailableTenantPrincipalContext,
): Promise<CommunityProfileLoadResult<CommunityOwnedProfile>> {
  assertContext(context, "community:profile:read");
  try {
    const result = await withDb((client) => loadOwnedProfileTx(client, context));
    if (!result.enabled) return { available: false, profile: null };
    return {
      available: true,
      profile: result.value ? mapProfile(result.value) : null,
    };
  } catch (error) {
    logger.error("[community-profile] owned profile load failed", {
      principalFingerprint: fingerprintCommunityProfilePrincipal({
        tenantId: context.tenantId,
        principalId: context.principalId,
      }),
      error: String(error),
    });
    return { available: false, profile: null };
  }
}

export async function loadPublicCommunityProfile(input: {
  tenantId: string;
  workspaceId: string;
  identifier: string;
}): Promise<CommunityProfileLoadResult<CommunityPublicProfile>> {
  const identifier = normalizePublicIdentifier(input.identifier);
  if (!identifier) return { available: true, profile: null };
  try {
    const result = await withDb(async (client) => {
      const selected = await client.query<CommunityProfileRow>(
        `${PROFILE_SELECT}
          WHERE profile.tenant_id = $1
            AND profile.workspace_id = $2
            AND profile.visibility = 'public'
            AND (
              profile.public_profile_id::text = $3
              OR lower(student.username) = lower($3)
              OR lower(COALESCE(cartax.public_student_id, '')) = lower($3)
            )
          LIMIT 1`,
        [input.tenantId, input.workspaceId, identifier],
      );
      return selected.rows[0] ?? null;
    });
    if (!result.enabled) return { available: false, profile: null };
    return {
      available: true,
      profile: result.value ? publicProjection(mapProfile(result.value)) : null,
    };
  } catch (error) {
    logger.error("[community-profile] public profile load failed", {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      error: String(error),
    });
    return { available: false, profile: null };
  }
}

export async function listPublicCommunityProfiles(input: {
  tenantId: string;
  workspaceId: string;
  limit?: number;
}): Promise<CommunityProfileLoadResult<CommunityPublicProfile[]>> {
  const limit = Math.max(1, Math.min(50, input.limit ?? 12));
  try {
    const result = await withDb(async (client) => {
      const selected = await client.query<CommunityProfileRow>(
        `${PROFILE_SELECT}
          WHERE profile.tenant_id = $1
            AND profile.workspace_id = $2
            AND profile.visibility = 'public'
            AND profile.leaderboard_visible = TRUE
          ORDER BY COALESCE(cartax.total_xp, 0) DESC,
                   COALESCE(cartax.completed_terms, 0) DESC,
                   profile.created_at ASC
          LIMIT $3`,
        [input.tenantId, input.workspaceId, limit],
      );
      return selected.rows.map((row) => publicProjection(mapProfile(row)));
    });
    return result.enabled
      ? { available: true, profile: result.value }
      : { available: false, profile: null };
  } catch (error) {
    logger.error("[community-profile] public profile list failed", {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      error: String(error),
    });
    return { available: false, profile: null };
  }
}

export async function updateCommunityProfileConsent(input: {
  context: AvailableTenantPrincipalContext;
  expectedRevision: number;
  consent: CommunityConsentSettings;
  audit: CommunityConsentAuditContext;
}): Promise<CommunityConsentUpdateResult> {
  assertContext(input.context, "community:profile:write");
  assertAudit(input.context, input.audit);
  const principalFingerprint = fingerprintCommunityProfilePrincipal({
    tenantId: input.context.tenantId,
    principalId: input.context.principalId,
  });

  try {
    const result = await withTx(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `community-profile:${input.context.tenantId}:${input.context.principalId}`,
      ]);
      const row = await loadOwnedProfileTx(client, input.context, true);
      if (!row) return { kind: "not_found" as const };

      const existingAudit = await client.query<ExistingConsentAudit>(
        `SELECT actor_type,
                actor_id,
                resource_type,
                resource_id,
                outcome,
                request_hash
           FROM sensitive_mutation_audit_events
          WHERE tenant_id = $1
            AND action = 'community.profile.consent.update'
            AND correlation_id = $2
          LIMIT 1`,
        [input.context.tenantId, input.audit.correlationId],
      );
      if (existingAudit.rows[0]) {
        const evidence = existingAudit.rows[0];
        if (
          evidence.actor_type !== input.audit.actorType ||
          evidence.actor_id !== input.audit.actorId ||
          evidence.resource_type !== "community_profile" ||
          evidence.resource_id !== row.public_profile_id ||
          evidence.outcome !== "success" ||
          evidence.request_hash !== input.audit.requestHash
        ) {
          return { kind: "idempotency_conflict" as const };
        }
        return {
          kind: "success" as const,
          changed: true,
          replayed: true,
          profile: mapProfile(row),
        };
      }

      const current = mapProfile(row);
      if (current.revision !== input.expectedRevision) {
        return { kind: "revision_conflict" as const };
      }
      if (
        sameConsent(current.consent, input.consent) &&
        current.consentVersion === COMMUNITY_PROFILE_CONSENT_VERSION
      ) {
        return {
          kind: "success" as const,
          changed: false,
          replayed: false,
          profile: current,
        };
      }

      const updated = await client.query<CommunityProfileRow>(
        `UPDATE academy_public_profiles
            SET visibility = $5,
                leaderboard_visible = $6,
                journal_sharing_enabled = $7,
                instructor_review_consent = $8,
                challenge_participation = $9,
                study_group_discovery = $10,
                consent_version = $11,
                consented_at = NOW(),
                revision = revision + 1,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND workspace_id = $2
            AND principal_type = 'student'
            AND principal_id = $3
            AND revision = $4
          RETURNING student_id::text,
                    tenant_id,
                    workspace_id,
                    principal_type,
                    principal_id,
                    public_profile_id::text,
                    visibility,
                    leaderboard_visible,
                    journal_sharing_enabled,
                    instructor_review_consent,
                    challenge_participation,
                    study_group_discovery,
                    revision,
                    consent_version,
                    consented_at,
                    updated_at,
                    NULL::text AS public_student_id,
                    NULL::text AS display_name,
                    NULL::text AS username,
                    NULL::text AS avatar,
                    NULL::int AS streak_days,
                    NULL::int AS total_xp,
                    NULL::int AS completed_terms,
                    NULL::int AS overall_progress,
                    '[]'::jsonb AS earned_badges`,
        [
          input.context.tenantId,
          input.context.workspaceId,
          input.context.principalId,
          input.expectedRevision,
          input.consent.profileVisibility,
          input.consent.leaderboardVisible,
          input.consent.journalSharingEnabled,
          input.consent.instructorReviewConsent,
          input.consent.challengeParticipation,
          input.consent.studyGroupDiscovery,
          COMMUNITY_PROFILE_CONSENT_VERSION,
        ],
      );
      if (!updated.rows[0]) return { kind: "revision_conflict" as const };

      await writeSensitiveMutationAuditTx(client, {
        ...input.audit,
        action: "community.profile.consent.update",
        resourceType: "community_profile",
        resourceId: row.public_profile_id,
        outcome: "success",
        metadata: {
          policyVersion: COMMUNITY_PROFILE_POLICY_VERSION,
          consentVersion: COMMUNITY_PROFILE_CONSENT_VERSION,
          principalFingerprint,
          expectedRevision: input.expectedRevision,
          revision: toNumber(updated.rows[0].revision),
          profileVisibility: input.consent.profileVisibility,
          leaderboardVisible: input.consent.leaderboardVisible,
          journalSharingEnabled: input.consent.journalSharingEnabled,
          instructorReviewConsent: input.consent.instructorReviewConsent,
          challengeParticipation: input.consent.challengeParticipation,
          studyGroupDiscovery: input.consent.studyGroupDiscovery,
        },
      });

      const complete = await loadOwnedProfileTx(client, input.context, false);
      if (!complete) throw new Error("community_profile_post_update_missing");
      return {
        kind: "success" as const,
        changed: true,
        replayed: false,
        profile: mapProfile(complete),
      };
    });

    if (!result.enabled) return { ok: false, reason: "unavailable" };
    if (result.value.kind === "not_found") {
      return { ok: false, reason: "not_found" };
    }
    if (result.value.kind === "revision_conflict") {
      return { ok: false, reason: "revision_conflict" };
    }
    if (result.value.kind === "idempotency_conflict") {
      return { ok: false, reason: "idempotency_conflict" };
    }
    return {
      ok: true,
      changed: result.value.changed,
      replayed: result.value.replayed,
      profile: result.value.profile,
    };
  } catch (error) {
    logger.error("[community-profile] consent update failed", {
      principalFingerprint,
      error: String(error),
    });
    return { ok: false, reason: "unavailable" };
  }
}

export function defaultCommunityConsent(): CommunityConsentSettings {
  return { ...DEFAULT_CONSENT };
}
