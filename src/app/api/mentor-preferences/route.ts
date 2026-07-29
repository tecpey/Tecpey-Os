import { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import {
  loadMentorAiPreferences,
  setMentorAiPreferences,
  fingerprintMentorPreferenceStudent,
} from "@/lib/ai/mentor-trust-store";
import { PLATFORM } from "@/lib/platform-config";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";

export const dynamic = "force-dynamic";

function noStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/mentor-preferences GET" },
    async () => {
      const session = await getCanonicalSession(req, { strictRevocation: true });
      if (!session.studentId) return noStore(apiError("academy_profile_required", 401));

      const limited = await rateLimit(req, {
        namespace: "mentor-preferences-read",
        identity: session.studentId,
        limit: 60,
        windowMs: 60_000,
      });
      if (!limited.ok) return noStore(apiError("rate_limited", 429));

      const loaded = await loadMentorAiPreferences(session.studentId);
      if (!loaded.available) {
        return noStore(apiError("mentor_preferences_unavailable", 503));
      }
      return noStore(apiOk({ preferences: loaded.preferences }));
    },
  );
}

export async function PATCH(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/mentor-preferences PATCH" },
    async () => {
      if (!verifyCsrfOrigin(req)) return noStore(apiError("forbidden", 403));
      const session = await getCanonicalSession(req, { strictRevocation: true });
      if (!session.studentId) return noStore(apiError("academy_profile_required", 401));

      const limited = await rateLimit(req, {
        namespace: "mentor-preferences-write",
        identity: session.studentId,
        limit: 10,
        windowMs: 60_000,
      });
      if (!limited.ok) return noStore(apiError("rate_limited", 429));

      const bounded = await readBoundedJsonRequest(req, { maxBytes: 2_048 });
      if (!bounded.ok) return noStore(apiError(bounded.error, bounded.status));
      const body = bounded.value as Record<string, unknown>;
      if (
        typeof body.externalProviderEnabled !== "boolean" ||
        typeof body.behavioralPersonalizationEnabled !== "boolean"
      ) {
        return noStore(apiError("invalid_mentor_preferences", 400));
      }

      const studentFingerprint = fingerprintMentorPreferenceStudent(
        session.studentId,
      );
      const updated = await setMentorAiPreferences({
        studentId: session.studentId,
        externalProviderEnabled: body.externalProviderEnabled,
        behavioralPersonalizationEnabled:
          body.behavioralPersonalizationEnabled,
        audit: {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorType: "student",
          actorId: session.studentId,
          correlationId: resolveSensitiveAuditCorrelation(
            req.headers.get("x-tecpey-request-id"),
          ),
          requestHash: hashSensitiveAuditRequest({
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            action: "mentor.preferences.update",
            studentFingerprint,
            externalProviderEnabled: body.externalProviderEnabled,
            behavioralPersonalizationEnabled:
              body.behavioralPersonalizationEnabled,
            realExchangeSignalsEnabled: false,
          }),
        },
      });
      if (!updated.ok) {
        return noStore(apiError("mentor_preferences_unavailable", 503));
      }

      return noStore(
        apiOk({
          preferences: updated.preferences,
          changed: updated.changed,
        }),
      );
    },
  );
}
