import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withTx } from "@/lib/db";
import { rateLimitUser } from "@/lib/rate-limit";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import { parseAcademyLocale, resolveOfficialLesson } from "@/lib/academy-lesson-progress";
import {
  readAcademyTermSectionProjection,
  submitAcademySectionCheckpoint,
} from "@/lib/academy-section-authority";
import { getTrustedClientIp } from "@/lib/security/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseIdempotencyKey(req: NextRequest, body: Record<string, unknown>): string | null {
  const value = String(req.headers.get("Idempotency-Key") ?? body.idempotencyKey ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 160);
  return /^[A-Za-z0-9._:-]{16,160}$/.test(value) ? value : null;
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-lesson-progress" }, async () => {
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);
    const limit = await rateLimitUser(req, {
      namespace: "academy-lesson-progress-read",
      limit: 120,
      windowMs: 60_000,
      userId: session.studentId,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const url = new URL(req.url);
    const locale = parseAcademyLocale(url.searchParams.get("locale"));
    const termSlug = String(url.searchParams.get("termSlug") ?? "").trim();
    if (!/^term-[1-7]$/.test(termSlug)) return apiError("invalid_term", 400);

    const result = await withTx((client) =>
      readAcademyTermSectionProjection(client, {
        studentId: session.studentId as string,
        locale,
        termSlug,
      }),
    );
    if (!result.enabled) return apiError("lesson_progress_service_not_configured", 503);
    if (!result.value) return apiError("term_not_found", 404);
    return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

export async function PUT(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-lesson-progress" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    if (!checkBodySize(req.headers.get("content-length"), 8_192)) {
      return apiError("payload_too_large", 413);
    }

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);
    const limit = await rateLimitUser(req, {
      namespace: "academy-lesson-progress-write",
      limit: 60,
      windowMs: 60_000,
      userId: session.studentId,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return apiError("invalid_json", 400);
    }

    const locale = parseAcademyLocale(body.locale);
    const termSlug = String(body.termSlug ?? "").trim();
    const sectionKey = String(body.sectionKey ?? "").trim();
    const questionVersion = String(body.questionVersion ?? "").trim().slice(0, 100);
    const selectedOptionId = String(body.selectedOptionId ?? "").trim().slice(0, 120);
    const idempotencyKey = parseIdempotencyKey(req, body);
    if (
      !resolveOfficialLesson(locale, termSlug, sectionKey)
      || !questionVersion
      || !selectedOptionId
      || !idempotencyKey
    ) {
      return apiError("invalid_lesson_checkpoint", 400);
    }

    const result = await withTx((client) =>
      submitAcademySectionCheckpoint(client, {
        studentId: session.studentId as string,
        locale,
        termSlug,
        sectionKey,
        questionVersion,
        selectedOptionId,
        idempotencyKey,
        networkIp: getTrustedClientIp(req),
      }),
    );
    if (!result.enabled) return apiError("lesson_progress_service_not_configured", 503);

    if (result.value.status === "lesson_not_found") return apiError("lesson_not_found", 404);
    if (result.value.status === "question_version_conflict") {
      return apiError("question_version_conflict", 409, {
        checkpoint: result.value.checkpoint,
      });
    }
    if (result.value.status === "idempotency_conflict") {
      return apiError("idempotency_key_conflict", 409);
    }
    if (result.value.status === "previous_term_required") {
      return apiError("previous_term_required", 403);
    }

    if (!result.value.response.replayed) {
      scheduleMentorProfileUpdate(session.studentId, "authoritative_section_checkpoint");
    }
    return apiOk(result.value.response, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-lesson-progress" }, async () =>
    apiError(
      "academy_lesson_progress_put_only",
      405,
      { authority: "server_checkpoint_v1" },
      { Allow: "GET, PUT", "Cache-Control": "no-store, max-age=0" },
    ),
  );
}
