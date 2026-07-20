import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { writeAudit } from "@/lib/security/audit-log";
import {
  loadMentorAiPreferences,
  setMentorAiPreferences,
} from "@/lib/ai/mentor-trust-store";

export const dynamic = "force-dynamic";

function noStore(response: Response): Response {
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

      const updated = await setMentorAiPreferences({
        studentId: session.studentId,
        externalProviderEnabled: body.externalProviderEnabled,
        behavioralPersonalizationEnabled: body.behavioralPersonalizationEnabled,
      });
      if (!updated.ok) return noStore(apiError("mentor_preferences_unavailable", 503));

      writeAudit({
        actorId: session.studentId,
        action: "risk_event",
        resourceType: "mentor_ai_preferences",
        resourceId: session.studentId,
        ip: getClientIp(req),
        userAgent: (req.headers.get("user-agent") ?? "").slice(0, 500),
        metadata: {
          event: "mentor_ai_preferences_changed",
          externalProviderEnabled: updated.preferences.externalProviderEnabled,
          behavioralPersonalizationEnabled:
            updated.preferences.behavioralPersonalizationEnabled,
          realExchangeSignalsEnabled: false,
          consentVersion: updated.preferences.consentVersion,
        },
      });

      return noStore(apiOk({ preferences: updated.preferences }));
    },
  );
}
