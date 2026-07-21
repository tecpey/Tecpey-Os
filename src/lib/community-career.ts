import type { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import {
  listPublicCommunityProfiles,
  loadOwnedCommunityProfile,
  loadPublicCommunityProfile,
  type CommunityPublicProfile,
} from "@/lib/community-profile-authority";
import { PLATFORM } from "@/lib/platform-config";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

export type PublicLearnerProfile = CommunityPublicProfile;

export type CareerSnapshot = {
  publicProfileId: string;
  displayName: string;
  tradingStyle: string;
  discipline: number;
  riskControl: number;
  psychology: number;
  consistency: number;
  recommendedTrack: string;
  nextActions: string[];
  mentorEndorsement: string;
  eligibility: "learning" | "ready_for_challenge" | "advanced_review";
};

export type ProfessionalChallenge = {
  id: string;
  title: string;
  description: string;
  status: "locked" | "available" | "in_progress" | "completed";
  requirements: string[];
  reward: string;
  progress: number;
};

function scoreClamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function getCurrentAcademyStudentId(
  req: NextRequest,
): Promise<string | null> {
  const session = await getCanonicalSession(req, { strictRevocation: true });
  return session.studentId ?? null;
}

export async function getCurrentPublicProfile(
  req: NextRequest,
): Promise<PublicLearnerProfile | null> {
  const session = await getCanonicalSession(req, { strictRevocation: true });
  if (!session.studentId) return null;
  const tenantContext = await resolveTenantPrincipalContext({
    session,
    requiredPrincipalType: "student",
    scopes: ["community:profile:read"],
    requestId: resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    ),
  });
  if (!tenantContext.available) return null;
  const loaded = await loadOwnedCommunityProfile(tenantContext);
  if (!loaded.available || !loaded.profile) return null;
  const {
    revision: _revision,
    consentVersion: _consentVersion,
    consentedAt: _consentedAt,
    consent: _consent,
    ...profile
  } = loaded.profile;
  return profile;
}

export async function getPublicProfile(
  identifier: string,
): Promise<PublicLearnerProfile | null> {
  const loaded = await loadPublicCommunityProfile({
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
    identifier,
  });
  return loaded.available ? loaded.profile : null;
}

export async function getHallOfFame(): Promise<PublicLearnerProfile[]> {
  const loaded = await listPublicCommunityProfiles({
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
    limit: 12,
  });
  return loaded.available && loaded.profile ? loaded.profile : [];
}

export async function getCareerSnapshot(
  req: NextRequest,
): Promise<CareerSnapshot | null> {
  const profile = await getCurrentPublicProfile(req);
  if (!profile) return null;

  const discipline = scoreClamp(
    45 + profile.streak * 4 + profile.achievementsCount * 3,
  );
  const riskControl = scoreClamp(
    35 + profile.currentTerm * 6 + Math.min(20, profile.xp / 150),
  );
  const psychology = scoreClamp(profile.mentorScore);
  const consistency = scoreClamp(
    40 + profile.currentTerm * 7 + profile.streak * 3,
  );
  const average = scoreClamp(
    (discipline + riskControl + psychology + consistency) / 4,
  );

  return {
    publicProfileId: profile.publicProfileId,
    displayName: profile.displayName,
    tradingStyle:
      average >= 82
        ? "مسیر آموزشی منظم"
        : average >= 68
          ? "دانشجوی در حال رشد"
          : "کاوشگر در مرحله شناخت",
    discipline,
    riskControl,
    psychology,
    consistency,
    recommendedTrack:
      average >= 82
        ? "Professional Challenge Track"
        : average >= 68
          ? "Risk & Psychology Builder"
          : "Foundation Builder",
    nextActions:
      average >= 82
        ? [
            "ادامه تمرین سرورمحور",
            "ثبت ژورنال معتبر",
            "انتظار برای فعال‌شدن بررسی مدرس",
          ]
        : [
            "تکمیل ترم جاری",
            "تمرین ساختاریافته مدیریت ریسک",
            "مرور درس‌های پایه",
          ],
    mentorEndorsement:
      average >= 82
        ? `${profile.displayName} برای ورود به مسیرهای پیشرفته باید استمرار آموزشی و ثبت evidence معتبر را حفظ کند.`
        : `${profile.displayName} در مسیر یادگیری قرار دارد و باید روی استمرار، مدیریت ریسک و تمرین سرورمحور تمرکز کند.`,
    eligibility:
      average >= 85
        ? "advanced_review"
        : average >= 70
          ? "ready_for_challenge"
          : "learning",
  };
}
