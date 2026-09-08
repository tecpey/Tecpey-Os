import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  cleanText,
  findStudentCartaxProfile,
  upsertStudentCartax,
} from "@/lib/student-cartax";
import { withDb } from "@/lib/db";
import { isSessionConfigured } from "@/lib/academy-session";
import { getCanonicalSession } from "@/lib/auth-session";
import { setUnifiedSessionCookieAsync } from "@/lib/unified-session";
import { apiOk, apiError, apiRateLimited } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";
import { isOwnedAcademyProfileAvatarUrl } from "@/lib/academy-profile-avatar-storage";

type LocalProfile = {
  id: string;
  public_student_id: string;
  email?: string | null;
  phone?: string | null;
  display_name?: string | null;
  username?: string | null;
  avatar?: string | null;
  photo_url?: string | null;
  learning_goal?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  country?: string | null;
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

const AVATAR_OPTIONS = new Set(["🟦", "🟣", "🟢", "🟠", "⚡", "🎓", "🧠", "📈"]);
const GENDERS = new Set(["female", "male", "nonbinary", "prefer_not_to_say"]);

function publicIdFromUuid(id: string) {
  return `TP-STD-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function localStorePath() {
  return path.join(process.cwd(), "storage", "academy-profiles.local.json");
}

function canUseLocalProfileStorage() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE === "true"
  );
}

function parseOptionalBirthDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("academy_birth_date_invalid");
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new Error("academy_birth_date_invalid");
  }
  if (date.getUTCFullYear() < 1900 || date.getTime() > Date.now()) {
    throw new Error("academy_birth_date_invalid");
  }
  return text;
}

function parseOptionalGender(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const gender = String(value).trim();
  if (!GENDERS.has(gender)) throw new Error("academy_gender_invalid");
  return gender;
}

function parseOptionalCountry(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const country = cleanText(value, 80);
  if (country.length < 2) throw new Error("academy_country_invalid");
  return country;
}

async function readLocalStore(): Promise<LocalStore> {
  if (!canUseLocalProfileStorage()) {
    return { byAccount: {}, profiles: {} };
  }
  try {
    const raw = await readFile(localStorePath(), "utf8");
    const parsed = JSON.parse(raw) as LocalStore;
    return {
      accountsByEmail: undefined,
      byAccount: parsed.byAccount || {},
      profiles: parsed.profiles || {},
    } as LocalStore;
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
  photoUrl?: string | null;
  learningGoal?: string;
  birthDate?: string | null;
  gender?: string | null;
  country?: string | null;
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
    photo_url: input.photoUrl === undefined ? existing.photo_url || null : input.photoUrl,
    learning_goal:
      cleanText(input.learningGoal, 120) || existing.learning_goal || null,
    birth_date: input.birthDate === undefined ? existing.birth_date || null : input.birthDate,
    gender: input.gender === undefined ? existing.gender || null : input.gender,
    country: input.country === undefined ? existing.country || null : input.country,
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
  return {
    studentId: id,
    publicStudentId: profile.public_student_id,
    profile,
  };
}

export async function GET(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/academy-student-profile" },
    async () => {
      const limit = await rateLimit(req, {
        namespace: "academy-student-profile-read",
        limit: 60,
        windowMs: 60_000,
      });
      if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);

      const session = await getCanonicalSession(req, { strictRevocation: true });
      if (session.authorityDegraded) {
        return apiError("academy_profile_service_unavailable", 503);
      }
      const authenticated = session.isAcademyUser || Boolean(session.studentId);
      const studentId = session.studentId;

      try {
        const result = await withDb((client) =>
          findStudentCartaxProfile(client, {
            studentId,
            email: session.email,
          }),
        );
        if (result.enabled) {
          const profile = result.value as { id?: string } | null;
          if (profile?.id) {
            const tenantContext = await resolveTenantPrincipalContext({
              session,
              request: req,
              requiredPrincipalType: "student",
              resolvedPrincipalId: String(profile.id),
              scopes: ["academy:learning-events:read"],
              requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
            });
            if (!tenantContext.available) {
              if (tenantContext.reason === "binding_storage_unavailable") {
                return apiError("academy_profile_service_unavailable", 503);
              }
              return apiOk({ authenticated, profile: null });
            }
            const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
            if (productGate) return productGate;
          }
          return apiOk({ authenticated, profile });
        }

        if (!canUseLocalProfileStorage()) {
          return apiError("academy_profile_service_unavailable", 503);
        }
        const local = await getLocalProfile(
          studentId,
          session.academyAccountId,
        );
        return apiOk({ authenticated, profile: local });
      } catch {
        if (!canUseLocalProfileStorage()) {
          return apiError("academy_profile_service_unavailable", 503);
        }
        const local = await getLocalProfile(
          studentId,
          session.academyAccountId,
        );
        return apiOk({ authenticated, profile: local });
      }
    },
  );
}

export async function POST(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/academy-student-profile" },
    async () => {
      if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);
      const limit = await rateLimit(req, {
        namespace: "academy-student-profile-write",
        limit: 30,
        windowMs: 60_000,
      });
      if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);

      try {
        const boundedBodyRequest = await readBoundedJsonRequest(req, {
          maxBytes: 80_000,
        });
        if (!boundedBodyRequest.ok) {
          return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
        }
        req = boundedBodyRequest.request;
        const raw = await req.text();
        if (raw.length > 20_000) return apiError("payload_too_large", 413);
        const body = JSON.parse(raw) as Record<string, unknown>;
        if (!isSessionConfigured()) {
          return apiError("session_service_not_configured", 503);
        }

        const session = await getCanonicalSession(req, {
          strictRevocation: true,
        });
        if (session.authorityDegraded) {
          return apiError("academy_profile_service_unavailable", 503);
        }
        if (!session.studentId && !session.isAcademyUser) {
          return apiError("academy_login_required", 401);
        }

        const birthDate = parseOptionalBirthDate(body.birthDate);
        const gender = parseOptionalGender(body.gender);
        const country = parseOptionalCountry(body.country);
        const requestedAvatar = typeof body.avatar === "string" ? body.avatar.trim() : undefined;
        if (requestedAvatar && !AVATAR_OPTIONS.has(requestedAvatar)) {
          return apiError("academy_avatar_invalid", 400);
        }

        let photoUrl: string | null | undefined;
        if (body.photoUrl === undefined) {
          photoUrl = undefined;
        } else if (body.photoUrl === null || body.photoUrl === "") {
          photoUrl = null;
        } else if (
          typeof body.photoUrl === "string" &&
          session.studentId &&
          isOwnedAcademyProfileAvatarUrl(body.photoUrl, session.studentId)
        ) {
          photoUrl = body.photoUrl;
        } else {
          return apiError("academy_profile_photo_invalid", 400);
        }

        const ip = getClientIp(req);
        const userAgent = (req.headers.get("user-agent") || "").slice(0, 500);
        // Email and mobile are identity-provider claims. They are displayed in
        // the profile editor but never accepted from the presentation form.
        const email = session.email ?? undefined;
        const result = await withDb(async (client) => {
          const verifiedPhone = session.academyAccountId
            ? await client.query<{ phone_e164: string | null }>(
                `SELECT phone_e164
                   FROM academy_auth_accounts
                  WHERE id = $1
                    AND phone_verified_at IS NOT NULL
                  LIMIT 1`,
                [session.academyAccountId],
              )
            : null;
          return upsertStudentCartax(
            client,
            {
              locale: typeof body.locale === "string" ? body.locale : undefined,
              email,
              phone: verifiedPhone?.rows[0]?.phone_e164 ?? undefined,
              displayName: typeof body.displayName === "string" ? body.displayName : session.displayName,
              username: typeof body.username === "string" ? body.username : session.username,
              avatar: requestedAvatar,
              photoUrl,
              learningGoal: typeof body.learningGoal === "string" ? body.learningGoal : undefined,
              birthDate,
              gender,
              country,
              source: typeof body.source === "string" ? body.source : "academy-profile-editor",
              ip,
              userAgent,
            },
            session.studentId ?? undefined,
          );
        });

        if (result.enabled && result.value) {
          const response = apiOk({
            storage: "cloud" as const,
            authenticated: true as const,
            ...(result.value as Record<string, unknown>),
          });
          await setUnifiedSessionCookieAsync(
            response,
            {
              accountId: session.academyAccountId,
              studentId: result.value.studentId,
              email: session.email,
              displayName: session.displayName,
              username: session.username,
            },
            { deviceInfo: userAgent, ip },
          );
          return response;
        }

        if (!canUseLocalProfileStorage()) {
          return apiError("academy_profile_service_unavailable", 503);
        }
        const local = await upsertLocalProfile({
          accountKey: session.academyAccountId || null,
          studentId: session.studentId || null,
          email,
          displayName: typeof body.displayName === "string" ? body.displayName : session.displayName,
          username: typeof body.username === "string" ? body.username : session.username,
          avatar: requestedAvatar,
          photoUrl,
          learningGoal: typeof body.learningGoal === "string" ? body.learningGoal : undefined,
          birthDate,
          gender,
          country,
          locale: typeof body.locale === "string" ? body.locale : undefined,
        });
        const response = apiOk({
          storage: "local-dev" as const,
          authenticated: true as const,
          studentId: local.studentId,
          publicStudentId: local.publicStudentId,
          profile: local.profile,
        });
        await setUnifiedSessionCookieAsync(
          response,
          {
            accountId: session.academyAccountId,
            studentId: local.studentId,
            email: session.email,
            displayName: session.displayName,
            username: session.username,
          },
          { deviceInfo: userAgent, ip },
        );
        return response;
      } catch (error) {
        if (error instanceof Error && [
          "academy_birth_date_invalid",
          "academy_gender_invalid",
          "academy_country_invalid",
        ].includes(error.message)) {
          return apiError(error.message, 400);
        }
        if (error && typeof error === "object" &&
          "code" in error && error.code === "23505" &&
          "constraint" in error && error.constraint === "academy_students_username_key") {
          return apiError("academy_username_unavailable", 409);
        }
        if (error instanceof Error && [
          "academy_student_identity_ambiguous",
          "academy_student_identity_missing",
        ].includes(error.message)) {
          return apiError("academy_profile_identity_conflict", 409);
        }
        if (
          error instanceof Error &&
          [
            "session_registry_unavailable",
            "session_owner_missing",
            "session_issue_failed",
          ].includes(error.message)
        ) {
          return apiError("session_registry_unavailable", 503);
        }
        return apiError("server_error", 500);
      }
    },
  );
}
