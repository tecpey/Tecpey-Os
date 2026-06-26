import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Client } from "pg";
import type { NextRequest } from "next/server";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { getAcademyAuthFromRequest } from "@/lib/academy-auth";
import { cleanText, ensureStudentCartaxTables } from "@/lib/student-cartax";
import { ensurePhase5Tables, getAchievementSnapshot } from "@/lib/phase5-achievement-engine";

export type PublicLearnerProfile = {
  studentId: string;
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
  visibility: "public" | "private";
  strengths: string[];
  growthAreas: string[];
  updatedAt: string;
};

export type CareerSnapshot = {
  studentId: string;
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

type LocalProfile = {
  id: string;
  public_student_id?: string;
  display_name?: string | null;
  username?: string | null;
  avatar?: string | null;
  streak_days?: number;
  total_xp?: number;
  completed_terms?: number;
  overall_progress?: number;
  identity_score?: number;
  retention_score?: number;
  community_score?: number;
  mentor_snapshot?: Record<string, unknown>;
  simulator_snapshot?: Record<string, unknown>;
  earned_badges?: unknown[];
  updated_at?: string;
};

type LocalProfileStore = { byAccount?: Record<string, string>; profiles?: Record<string, LocalProfile> };
type CommunityStore = { visibility: Record<string, "public" | "private">; endorsements: Record<string, string[]> };

function localProfilePath() {
  return path.join(process.cwd(), "storage", "academy-profiles.local.json");
}

function communityPath() {
  return path.join(process.cwd(), "storage", "community-career.local.json");
}

export function isLocalDevRequest(req?: NextRequest | null) {
  const host = req?.headers.get("host") || "";
  return process.env.NODE_ENV !== "production" || host.startsWith("localhost") || host.startsWith("127.0.0.1") || process.env.TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE === "true";
}

async function readLocalProfiles(): Promise<LocalProfileStore> {
  try {
    const raw = await readFile(localProfilePath(), "utf8");
    const parsed = JSON.parse(raw) as LocalProfileStore;
    return { byAccount: parsed.byAccount || {}, profiles: parsed.profiles || {} };
  } catch {
    return { byAccount: {}, profiles: {} };
  }
}

async function readCommunityStore(): Promise<CommunityStore> {
  try {
    const raw = await readFile(communityPath(), "utf8");
    const parsed = JSON.parse(raw) as CommunityStore;
    return { visibility: parsed.visibility || {}, endorsements: parsed.endorsements || {} };
  } catch {
    return { visibility: {}, endorsements: {} };
  }
}

async function writeCommunityStore(store: CommunityStore) {
  await mkdir(path.dirname(communityPath()), { recursive: true });
  await writeFile(communityPath(), JSON.stringify(store, null, 2), "utf8");
}

function publicIdFromUuid(id: string) {
  return `TP-STD-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function normalizeUsername(value?: string | null) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 32);
}

function normalizePublicId(value?: string | null) {
  return String(value || "").trim().replace(/[^A-Z0-9_.@-]/gi, "").slice(0, 60);
}

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function scoreClamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function profileFromLocal(row: LocalProfile, visibility: "public" | "private" = "public"): PublicLearnerProfile {
  const xp = toNumber(row.total_xp, 0);
  const completedTerms = toNumber(row.completed_terms, 0);
  const overall = toNumber(row.overall_progress, 0);
  const mentorScore = scoreClamp(55 + completedTerms * 5 + Math.min(20, xp / 100));
  const arenaScore = scoreClamp(45 + toNumber(row.simulator_snapshot?.trades, 0) * 2 + toNumber(row.simulator_snapshot?.riskScore, 0));
  const careerScore = scoreClamp((mentorScore + arenaScore + overall) / 3);
  const tradingStyle = careerScore >= 82 ? "منظم و آماده مسیر پیشرفته" : careerScore >= 65 ? "در حال شکل‌گیری" : "در حال یادگیری";
  return {
    studentId: row.id,
    publicStudentId: row.public_student_id || publicIdFromUuid(row.id),
    displayName: cleanText(row.display_name, 120) || "دانشجوی تک‌پی",
    username: normalizeUsername(row.username) || `student-${(row.public_student_id || row.id).slice(-6).toLowerCase()}`,
    avatar: cleanText(row.avatar, 20) || "🟦",
    level: completedTerms >= 5 ? "Advanced Learner" : completedTerms >= 2 ? "Active Learner" : "Explorer",
    currentTerm: Math.max(1, completedTerms + 1),
    xp,
    streak: toNumber(row.streak_days, 1),
    achievementsCount: Array.isArray(row.earned_badges) ? row.earned_badges.length : 0,
    certificatesCount: completedTerms,
    mentorScore,
    arenaScore,
    careerScore,
    tradingStyle,
    visibility,
    strengths: careerScore > 70 ? ["استمرار آموزشی", "مدیریت ریسک رو به رشد"] : ["شروع مسیر یادگیری", "آمادگی برای تمرین"],
    growthAreas: arenaScore < 70 ? ["تمرین در Trading Arena", "ثبت ژورنال معامله"] : ["چالش‌های پیشرفته", "تحلیل عملکرد"],
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export async function getCurrentAcademyStudentId(req: NextRequest) {
  const studentSession = await getStudentSessionFromRequest(req);
  if (studentSession?.studentId) return studentSession.studentId;
  const auth = await getAcademyAuthFromRequest(req);
  if (!auth?.accountId) return null;
  const store = await readLocalProfiles();
  return store.byAccount?.[auth.accountId] || null;
}

async function withClient<T>(handler: (client: Client) => Promise<T>) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes("CHANGE_ME")) return { enabled: false as const, value: null };
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await ensureStudentCartaxTables(client);
    await ensurePhase5Tables(client);
    await ensureCommunityTables(client);
    return { enabled: true as const, value: await handler(client) };
  } finally {
    await client.end().catch(() => null);
  }
}

export async function ensureCommunityTables(client: Client) {
  await client.query(`CREATE TABLE IF NOT EXISTS academy_public_profiles (
    student_id uuid PRIMARY KEY,
    visibility text NOT NULL DEFAULT 'public',
    mentor_endorsement text,
    career_track text,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS academy_professional_challenges (
    id text PRIMARY KEY,
    title text NOT NULL,
    description text NOT NULL,
    reward text NOT NULL,
    requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
    min_career_score int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS academy_challenge_progress (
    challenge_id text NOT NULL REFERENCES academy_professional_challenges(id) ON DELETE CASCADE,
    student_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'available',
    progress int NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(challenge_id, student_id)
  )`);
}

export async function getCurrentPublicProfile(req: NextRequest): Promise<PublicLearnerProfile | null> {
  const studentId = await getCurrentAcademyStudentId(req);
  if (!studentId) return null;
  const result = await withClient(async (client) => {
    const q = await client.query(
      `SELECT s.id, s.public_student_id, s.display_name, s.username, s.avatar, s.streak_days,
              c.total_xp, c.completed_terms, c.overall_progress, c.earned_badges, c.mentor_snapshot, c.simulator_snapshot,
              COALESCE(p.visibility, 'public') AS visibility
       FROM academy_students s
       LEFT JOIN academy_student_cartax c ON c.student_id = s.id
       LEFT JOIN academy_public_profiles p ON p.student_id = s.id
       WHERE s.id = $1::uuid
       LIMIT 1`,
      [studentId],
    );
    return q.rows[0] ? profileFromLocal(q.rows[0], q.rows[0].visibility) : null;
  }).catch(() => ({ enabled: false as const, value: null }));
  if (result.enabled) return result.value;
  const profiles = await readLocalProfiles();
  const store = await readCommunityStore();
  const row = profiles.profiles?.[studentId];
  if (!row) return null;
  return profileFromLocal(row, store.visibility[studentId] || "public");
}

export async function getPublicProfile(identifier: string): Promise<PublicLearnerProfile | null> {
  const safe = normalizePublicId(identifier).replace(/^@/, "");
  const result = await withClient(async (client) => {
    const q = await client.query(
      `SELECT s.id, s.public_student_id, s.display_name, s.username, s.avatar, s.streak_days,
              c.total_xp, c.completed_terms, c.overall_progress, c.earned_badges, c.mentor_snapshot, c.simulator_snapshot,
              COALESCE(p.visibility, 'public') AS visibility
       FROM academy_students s
       LEFT JOIN academy_student_cartax c ON c.student_id = s.id
       LEFT JOIN academy_public_profiles p ON p.student_id = s.id
       WHERE lower(s.username) = lower($1) OR s.public_student_id = $2
       LIMIT 1`,
      [safe, safe],
    );
    const row = q.rows[0];
    if (!row || row.visibility === "private") return null;
    return profileFromLocal(row, row.visibility);
  }).catch(() => ({ enabled: false as const, value: null }));
  if (result.enabled) return result.value;
  const profiles = await readLocalProfiles();
  const store = await readCommunityStore();
  const rows = Object.values(profiles.profiles || {});
  const row = rows.find((p) => normalizeUsername(p.username) === safe.toLowerCase() || (p.public_student_id || publicIdFromUuid(p.id)) === safe);
  if (!row || (store.visibility[row.id] || "public") === "private") return null;
  return profileFromLocal(row, store.visibility[row.id] || "public");
}

export async function setCurrentPublicVisibility(req: NextRequest, visibility: "public" | "private") {
  const studentId = await getCurrentAcademyStudentId(req);
  if (!studentId) return null;
  const result = await withClient(async (client) => {
    await client.query(
      `INSERT INTO academy_public_profiles(student_id, visibility, updated_at)
       VALUES($1::uuid, $2, now())
       ON CONFLICT(student_id) DO UPDATE SET visibility = EXCLUDED.visibility, updated_at = now()`,
      [studentId, visibility],
    );
    return true;
  }).catch(() => ({ enabled: false as const, value: null }));
  if (result.enabled) return true;
  const store = await readCommunityStore();
  store.visibility[studentId] = visibility;
  await writeCommunityStore(store);
  return true;
}

export async function getHallOfFame(): Promise<PublicLearnerProfile[]> {
  const result = await withClient(async (client) => {
    const q = await client.query(
      `SELECT s.id, s.public_student_id, s.display_name, s.username, s.avatar, s.streak_days,
              c.total_xp, c.completed_terms, c.overall_progress, c.earned_badges, c.mentor_snapshot, c.simulator_snapshot,
              COALESCE(p.visibility, 'public') AS visibility
       FROM academy_students s
       LEFT JOIN academy_student_cartax c ON c.student_id = s.id
       LEFT JOIN academy_public_profiles p ON p.student_id = s.id
       WHERE COALESCE(p.visibility, 'public') = 'public'
       ORDER BY COALESCE(c.total_xp,0) DESC, COALESCE(c.completed_terms,0) DESC, s.created_at ASC
       LIMIT 12`,
    );
    return q.rows.map((row) => profileFromLocal(row, row.visibility));
  }).catch(() => ({ enabled: false as const, value: null }));
  if (result.enabled) return result.value || [];
  const profiles = await readLocalProfiles();
  const store = await readCommunityStore();
  return Object.values(profiles.profiles || {})
    .filter((p) => (store.visibility[p.id] || "public") === "public")
    .map((p) => profileFromLocal(p, store.visibility[p.id] || "public"))
    .sort((a, b) => b.xp - a.xp || b.currentTerm - a.currentTerm)
    .slice(0, 12);
}

export async function getCareerSnapshot(req: NextRequest): Promise<CareerSnapshot | null> {
  const profile = await getCurrentPublicProfile(req);
  if (!profile) return null;
  const discipline = scoreClamp(45 + profile.streak * 4 + profile.achievementsCount * 3);
  const riskControl = scoreClamp(profile.arenaScore + (profile.strengths.includes("مدیریت ریسک رو به رشد") ? 8 : 0));
  const psychology = scoreClamp(profile.mentorScore - (profile.growthAreas.includes("ثبت ژورنال معامله") ? 6 : 0));
  const consistency = scoreClamp(40 + profile.currentTerm * 7 + profile.streak * 3);
  const average = scoreClamp((discipline + riskControl + psychology + consistency) / 4);
  return {
    studentId: profile.studentId,
    displayName: profile.displayName,
    tradingStyle: average >= 82 ? "Swing Trader منظم" : average >= 68 ? "Learner Trader در حال رشد" : "Explorer در مرحله شناخت",
    discipline,
    riskControl,
    psychology,
    consistency,
    recommendedTrack: average >= 82 ? "Professional Challenge Track" : average >= 68 ? "Risk & Psychology Builder" : "Foundation Builder",
    nextActions: average >= 82 ? ["شروع چالش حرفه‌ای", "ثبت ۲۰ ژورنال کامل", "درخواست بررسی منتور"] : ["تکمیل ترم جاری", "ثبت ۵ معامله تمرینی", "مرور درس مدیریت ریسک"],
    mentorEndorsement: average >= 82 ? `${profile.displayName} برای ورود به چالش‌های پیشرفته نیازمند حفظ انضباط فعلی و ثبت ژورنال دقیق است.` : `${profile.displayName} در مسیر یادگیری قرار دارد و باید روی استمرار، مدیریت ریسک و تمرین عملی تمرکز کند.`,
    eligibility: average >= 85 ? "advanced_review" : average >= 70 ? "ready_for_challenge" : "learning",
  };
}

export async function getProfessionalChallenges(req: NextRequest): Promise<ProfessionalChallenge[]> {
  const career = await getCareerSnapshot(req);
  const score = career ? scoreClamp((career.discipline + career.riskControl + career.psychology + career.consistency) / 4) : 0;
  const base: ProfessionalChallenge[] = [
    {
      id: "risk-foundation-20",
      title: "چالش ۲۰ تصمیم مسئولانه",
      description: "۲۰ تمرین یا معامله آزمایشی با ثبت دلیل ورود، احساس، ریسک و برنامه خروج.",
      status: score >= 45 ? "available" : "locked",
      requirements: ["پروفایل آکادمی فعال", "ثبت ژورنال برای هر تصمیم", "ریسک هر تصمیم کمتر از ۲٪"],
      reward: "Badge مدیریت ریسک مسئولانه",
      progress: Math.min(100, score),
    },
    {
      id: "psychology-control-10",
      title: "چالش کنترل احساسات",
      description: "۱۰ سناریوی تمرینی بعد از ضرر یا نوسان شدید، بدون تصمیم هیجانی.",
      status: score >= 65 ? "available" : "locked",
      requirements: ["حداقل ۵ ژورنال کامل", "ثبت احساس قبل و بعد از تصمیم", "عدم تکرار خطای Revenge Trading"],
      reward: "Badge روانشناسی معامله",
      progress: score >= 65 ? Math.min(100, score - 10) : Math.max(0, score - 35),
    },
    {
      id: "professional-review",
      title: "درخواست بررسی مسیر حرفه‌ای",
      description: "بررسی نهایی کارنامه، ژورنال، آزمون‌ها و رفتار معاملاتی برای مسیر تخصصی تک‌پی.",
      status: score >= 85 ? "available" : "locked",
      requirements: ["چند ترم تکمیل‌شده", "امتیاز Career بالای ۸۵", "ژورنال و عملکرد پایدار"],
      reward: "دعوت به ارزیابی پیشرفته آکادمی",
      progress: Math.min(100, score),
    },
  ];
  return base;
}
