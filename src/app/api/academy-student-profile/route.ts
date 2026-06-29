import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { cleanText, upsertStudentCartax } from "@/lib/student-cartax";
import { withDb } from "@/lib/db";
import { isSessionConfigured } from "@/lib/academy-session";
import { getCanonicalSession } from "@/lib/auth-session";
import { setUnifiedSessionCookieAsync } from "@/lib/unified-session";
import { apiOk, apiError, apiRateLimited } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
// TODO(cookie-migration): remove getStudentSessionFromRequest / getAcademyAuthFromRequest
//   imports once canonical session replaces all per-cookie reads.

type LocalProfile = {
  id: string;
  public_student_id: string;
  email?: string | null;
  phone?: string | null;
  display_name?: string | null;
  username?: string | null;
  avatar?: string | null;
  learning_goal?: string | null;
  locale?: string;
  streak_days?: number;
  progress?: Record<string, unknown>;
  earned_badges?: unknown[];
  mentor_snapshot?: Record<string, unknown>;
  simulator_snapshot?: Record<string, unknown>;
  total_xp?: number;
  completed_terms?: number;
  overall_progress?: number;
  identity_score?: number;
  retention_score?: number;
  community_score?: number;
  updated_at?: string;
};

type LocalStore = {
  byAccount: Record<string, string>;
  profiles: Record<string, LocalProfile>;
};

function publicIdFromUuid(id: string) {
  return `TP-STD-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function localStorePath() {
  return path.join(process.cwd(), "storage", "academy-profiles.local.json");
}

function canUseLocalProfileStorage() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE === "true"
  );
}

async function readLocalStore(): Promise<LocalStore> {
  if (!canUseLocalProfileStorage())
    return { byAccount: {}, profiles: {} };
  try {
    const raw = await readFile(localStorePath(), "utf8");
    const parsed = JSON.parse(raw) as LocalStore;
    return {
      byAccount: parsed.byAccount || {},
      profiles: parsed.profiles || {},
    };
  } catch {
    return { byAccount: {}, profiles: {} };
  }
}

async function writeLocalStore(store: LocalStore) {
  if (!canUseLocalProfileStorage()) return;
  await mkdir(path.dirname(localStorePath()), { recursive: true });
  await writeFile(localStorePath(), JSON.stringify(store, null, 2), "utf8");
}

async function getLocalProfile(
  studentId?: string | null,
  accountKey?: string | null,
) {
  const store = await readLocalStore();
  const id = studentId || (accountKey ? store.byAccount[accountKey] : null);
  if (!id) return null;
  return store.profiles[id] || null;
}

async function upsertLocalProfile(input: {
  accountKey?: string | null;
  studentId?: string | null;
  email?: string | null;
  phone?: string | null;
  displayName?: string;
  username?: string;
  avatar?: string;
  learningGoal?: string;
  locale?: string;
}) {
  const store = await readLocalStore();
  const existingId =
    input.studentId ||
    (input.accountKey ? store.byAccount[input.accountKey] : undefined);
  const id = existingId || randomUUID();
  if (input.accountKey) store.byAccount[input.accountKey] = id;
  const existing = store.profiles[id] || ({} as LocalProfile);
  const profile: LocalProfile = {
    id,
    public_student_id: existing.public_student_id || publicIdFromUuid(id),
    email: cleanText(input.email, 180) || existing.email || null,
    phone: cleanText(input.phone, 60) || existing.phone || null,
    display_name:
      cleanText(input.displayName, 160) || existing.display_name || null,
    username:
      cleanText(input.username, 80)
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, "")
        .slice(0, 32) ||
      existing.username ||
      null,
    avatar: cleanText(input.avatar, 40) || existing.avatar || "🟦",
    learning_goal:
      cleanText(input.learningGoal, 120) || existing.learning_goal || null,
    locale: cleanText(input.locale || existing.locale || "fa", 10) || "fa",
    streak_days: Math.max(1, Number(existing.streak_days || 1)),
    progress: existing.progress || {},
    earned_badges: existing.earned_badges || [],
    mentor_snapshot: existing.mentor_snapshot || {},
    simulator_snapshot: existing.simulator_snapshot || {},
    total_xp: Number(existing.total_xp || 0),
    completed_terms: Number(existing.completed_terms || 0),
    overall_progress: Number(existing.overall_progress || 0),
    identity_score: 35,
    retention_score: Number(existing.retention_score || 10),
    community_score: Number(existing.community_score || 10),
    updated_at: new Date().toISOString(),
  };
  store.profiles[id] = profile;
  await writeLocalStore(store);
  return { studentId: id, publicStudentId: profile.public_student_id, profile };
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-student-profile" }, async () => {
  const limit = await rateLimit(req, {
    namespace: "academy-student-profile-read",
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.ok)
    return apiRateLimited(limit.retryAfterSeconds);

  const session = await getCanonicalSession(req);
  const authenticated = session.isAcademyUser || Boolean(session.studentId);
  const studentId = session.studentId;

  try {
    const result = await withDb(async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (studentId) {
        values.push(studentId);
        filters.push(`s.id = $${values.length}::uuid`);
      }
      if (session.email) {
        values.push(session.email);
        filters.push(`s.email = $${values.length}`);
      }
      if (!filters.length) return null;
      const query = await client.query(
        `SELECT s.id, s.public_student_id, s.email, s.phone, s.display_name, s.username, s.avatar, s.learning_goal, s.locale, s.streak_days, s.last_active_day,
                c.progress, c.earned_badges, c.mentor_snapshot, c.simulator_snapshot,
                c.total_xp, c.completed_terms, c.overall_progress, c.identity_score, c.retention_score, c.community_score, c.updated_at
         FROM academy_students s
         LEFT JOIN academy_student_cartax c ON c.student_id = s.id
         WHERE ${filters.join(" OR ")}
         LIMIT 1`,
        values,
      );
      return query.rows[0] || null;
    });
    if (result.enabled)
      return apiOk({ authenticated, profile: result.value });

    const local = await getLocalProfile(studentId, session.academyAccountId);
    return apiOk({ authenticated, profile: local });
  } catch {
    const local = await getLocalProfile(studentId, session.academyAccountId);
    return apiOk({ authenticated, profile: local });
  }
  }); // end withObservability
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-student-profile" }, async () => {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  const limit = await rateLimit(req, {
    namespace: "academy-student-profile-write",
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.ok)
    return apiRateLimited(limit.retryAfterSeconds);

  try {
    const raw = await req.text();
    if (raw.length > 20_000)
      return apiError("payload_too_large", 413);
    const body = JSON.parse(raw);
    if (!isSessionConfigured())
      return apiError("session_service_not_configured", 503);

    const session = await getCanonicalSession(req);
    if (!session.studentId && !session.isAcademyUser) {
      return apiError("academy_login_required", 401);
    }

    const email = body.email || session.email;
    const result = await withDb(async (client) =>
      upsertStudentCartax(
        client,
        {
          locale: body.locale,
          email,
          phone: body.phone,
          googleId: body.googleId,
          appleId: body.appleId,
          displayName: body.displayName || session.displayName,
          username: body.username || session.username,
          avatar: body.avatar,
          learningGoal: body.learningGoal,
          source: body.source || "academy-onboarding",
          ip: getClientIp(req),
          userAgent: req.headers.get("user-agent") || "",
        },
        session.studentId ?? undefined,
      ),
    );

    if (result.enabled && result.value) {
      const response = apiOk({ storage: "cloud" as const, authenticated: true as const, ...result.value as Record<string, unknown> });
      await setUnifiedSessionCookieAsync(response, {
        accountId: session.academyAccountId,
        studentId: result.value.studentId,
        email: session.email,
        displayName: session.displayName,
        username: session.username,
      });
      return response;
    }

    if (!canUseLocalProfileStorage())
      return apiError("academy_profile_service_unavailable", 503);
    const local = await upsertLocalProfile({
      accountKey: session.academyAccountId || null,
      studentId: session.studentId || null,
      email,
      phone: body.phone,
      displayName: body.displayName || session.displayName,
      username: body.username || session.username,
      avatar: body.avatar,
      learningGoal: body.learningGoal,
      locale: body.locale,
    });
    const response = apiOk({ storage: "local-dev" as const, authenticated: true as const, studentId: local.studentId, publicStudentId: local.publicStudentId, profile: local.profile });
    await setUnifiedSessionCookieAsync(response, {
      accountId: session.academyAccountId,
      studentId: local.studentId,
      email: session.email,
      displayName: session.displayName,
      username: session.username,
    });
    return response;
  } catch {
    return apiError("server_error", 500);
  }
  }); // end withObservability
}
