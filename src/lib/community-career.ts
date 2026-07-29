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

/**
 * Legacy Community career and Hall-of-Fame presentation authority.
 *
 * These values are educational previews derived from Academy profile data.
 * They are not Community Reputation Ranking v1 evidence, scores or ranks and
 * must never authorize rewards, scholarships, funded accounts, Mentor
 * decisions, Instructor grants, employability claims or financial controls.
 */
export const COMMUNITY_CAREER_AUTHORITY = "preview-only" as const;

export type PublicLearnerProfile = CommunityPublicProfile & {
  authority: typeof COMMUNITY_CAREER_AUTHORITY;
};

export type CareerSnapshot = {
  authority: typeof COMMUNITY_CAREER_AUTHORITY;
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
  authority: typeof COMMUNITY_CAREER_AUTHORITY;
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

function previewProfile(profile: CommunityPublicProfile): PublicLearnerProfile {
  return {
    ...profile,
    authority: COMMUNITY_CAREER_AUTHORITY,
  };
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
  return previewProfile({
    publicProfileId: loaded.profile.publicProfileId,
    publicStudentId: loaded.profile.publicStudentId,
    displayName: loaded.profile.displayName,
    username: loaded.profile.username,
    avatar: loaded.profile.avatar,
    level: loaded.profile.level,
    currentTerm: loaded.profile.currentTerm,
    xp: loaded.profile.xp,
    streak: loaded.profile.streak,
    achievementsCount: loaded.profile.achievementsCount,
    certificatesCount: loaded.profile.certificatesCount,
    mentorScore: loaded.profile.mentorScore,
    arenaScore: loaded.profile.arenaScore,
    careerScore: loaded.profile.careerScore,
    tradingStyle: loaded.profile.tradingStyle,
    visibility: loaded.profile.visibility,
    strengths: loaded.profile.strengths,
    growthAreas: loaded.profile.growthAreas,
    updatedAt: loaded.profile.updatedAt,
  });
}

export async function getPublicProfile(
  identifier: string,
): Promise<PublicLearnerProfile | null> {
  const loaded = await loadPublicCommunityProfile({
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
    identifier,
  });
  return loaded.available && loaded.profile
    ? previewProfile(loaded.profile)
    : null;
}

export async function getHallOfFame(): Promise<PublicLearnerProfile[]> {
  const loaded = await listPublicCommunityProfiles({
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    workspaceId: PLATFORM.DEFAULT_WORKSPACE_ID,
    limit: 12,
  });
  return loaded.available && loaded.profile
    ? loaded.profile.map(previewProfile)
    : [];
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
    authority: COMMUNITY_CAREER_AUTHORITY,
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

export async function getProfessionalChallenges(
  req: NextRequest,
): Promise<ProfessionalChallenge[]> {
  const career = await getCareerSnapshot(req);
  const score = career
    ? scoreClamp(
        (career.discipline +
          career.riskControl +
          career.psychology +
          career.consistency) /
          4,
      )
    : 0;

  return [
    {
      authority: COMMUNITY_CAREER_AUTHORITY,
      id: "risk-foundation-20",
      title: "چالش ۲۰ تصمیم مسئولانه",
      description:
        "کاتالوگ تمرینی برای تصمیم‌های ثبت‌شده و مدیریت ریسک؛ تکمیل و پاداش رسمی تا مهاجرت authority چالش غیرفعال است.",
      status: score >= 45 ? "available" : "locked",
      requirements: [
        "پروفایل آکادمی فعال",
        "تمرین در مسیر سرورمحور",
        "ریسک هر تصمیم کمتر از ۲٪",
      ],
      reward: "پیش‌نمایش Badge مدیریت ریسک مسئولانه",
      progress: 0,
    },
    {
      authority: COMMUNITY_CAREER_AUTHORITY,
      id: "psychology-control-10",
      title: "چالش کنترل احساسات",
      description:
        "کاتالوگ تمرینی سناریوهای بعد از ضرر یا نوسان؛ هیچ نتیجه مرورگر evidence رسمی نیست.",
      status: score >= 65 ? "available" : "locked",
      requirements: [
        "مرور درس روانشناسی معامله",
        "ثبت reflection معتبر",
        "عدم تکرار تصمیم هیجانی",
      ],
      reward: "پیش‌نمایش Badge روانشناسی معامله",
      progress: 0,
    },
    {
      authority: COMMUNITY_CAREER_AUTHORITY,
      id: "professional-review",
      title: "درخواست بررسی مسیر حرفه‌ای",
      description:
        "این مسیر تا ایجاد consent و grant مستقل مدرس فقط پیش‌نمایش است و درخواست واقعی ایجاد نمی‌کند.",
      status: "locked",
      requirements: [
        "چند ترم تکمیل‌شده",
        "evidence معتبر سرور",
        "فعال‌شدن authority بررسی مدرس",
      ],
      reward: "پیش‌نمایش دعوت به ارزیابی پیشرفته",
      progress: 0,
    },
  ];
}
