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
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";

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
      if (!session.studentId) {
        // A degraded revocation authority returns a guest with no studentId;
        // that is an outage, reported as the same 503 this read already returns
        // when its store is unavailable, not a 401 that tells a valid user their
        // profile is gone.
        if (session.authorityDegraded) return noStore(apiError("mentor_preferences_unavailable", 503));
        return noStore(apiError("academy_profile_required", 401));
      }

      const limited = await rateLimit(req, {
        namespace: "mentor-preferences-read",
        identity: session.studentId,
        limit: 60,
        windowMs: 60_000,
      });
      if (!limited.ok) return noStore(apiError("rate_limited", 429));

      // mentor_ai_preferences is student_global (ON CONFLICT student_id per the
      // classification registry): no tenant column, so reading it by
      // session.studentId alone served the student their consent preferences on
      // any tenant's branded host. Resolving the acting tenant confirms the
      // binding, refuses a foreign host, and lets the Mentor product gate run.
      const tenantContext = await resolveTenantPrincipalContext({
        session,
        request: req,
        requiredPrincipalType: "student",
        scopes: ["academy:learning-events:read"],
        requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
      });
      if (!tenantContext.available) {
        // A binding that could not be read is an outage (503); an ordinary
        // authorization outcome — unbound, revoked, a workspace mismatch, or a
        // foreign branded host — is a refusal, not an outage. Preferences are a
        // fixed object with no honest "empty", so the refusal is a 403 rather
        // than a fabricated default-off consent the student never chose.
        if (tenantContext.reason === "binding_storage_unavailable") {
          return noStore(apiError("mentor_preferences_unavailable", 503));
        }
        return noStore(apiError("forbidden", 403));
      }
      const productGate = await requireTenantProduct(tenantContext.tenantId, "mentor");
      if (productGate) return noStore(productGate);

      const loaded = await loadMentorAiPreferences(tenantContext.principalId);
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
      if (!await verifyCsrfOrigin(req)) return noStore(apiError("forbidden", 403));
      const session = await getCanonicalSession(req, { strictRevocation: true });
      if (!session.studentId) return noStore(apiError("academy_profile_required", 401));

      const limited = await rateLimit(req, {
        namespace: "mentor-preferences-write",
        identity: session.studentId,
        limit: 10,
        windowMs: 60_000,
      });
      if (!limited.ok) return noStore(apiError("rate_limited", 429));

      // A consent write must resolve the acting tenant before it records
      // anything: it confirms the student's binding and refuses a foreign
      // branded host. Any not-available outcome fails closed rather than writing
      // consent — and stamping an audit row — under a tenant the student may not
      // act in.
      const tenantContext = await resolveTenantPrincipalContext({
        session,
        request: req,
        requiredPrincipalType: "student",
        scopes: ["academy:learning-events:write"],
        requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
      });
      if (!tenantContext.available) return noStore(apiError("mentor_preferences_unavailable", 503));

      const bounded = await readBoundedJsonRequest(req, { maxBytes: 2_048 });
      if (!bounded.ok) return noStore(apiError(bounded.error, bounded.status));
      const body = bounded.value as Record<string, unknown>;
      if (
        typeof body.externalProviderEnabled !== "boolean" ||
        typeof body.behavioralPersonalizationEnabled !== "boolean"
      ) {
        return noStore(apiError("invalid_mentor_preferences", 400));
      }

      // Consent revocation must stay reachable even when the tenant is not (or is
      // no longer) entitled to Mentor. The Mentor execution path (/api/ai-mentor)
      // reads this saved consent and calls the external provider while
      // externalProviderEnabled is true, so a student must always be able to turn
      // it off. The product gate therefore applies only to a request that would
      // ENABLE external-provider use or behavioral personalization — you may not
      // switch on a product the tenant is not entitled to — while a request that
      // only disables both is always admitted (#438 review, Codex P1).
      if (body.externalProviderEnabled || body.behavioralPersonalizationEnabled) {
        const productGate = await requireTenantProduct(tenantContext.tenantId, "mentor");
        if (productGate) return noStore(productGate);
      }

      const studentFingerprint = fingerprintMentorPreferenceStudent(
        tenantContext.principalId,
      );
      const updated = await setMentorAiPreferences({
        studentId: tenantContext.principalId,
        externalProviderEnabled: body.externalProviderEnabled,
        behavioralPersonalizationEnabled:
          body.behavioralPersonalizationEnabled,
        audit: {
          tenantId: tenantContext.tenantId,
          actorType: "student",
          actorId: tenantContext.principalId,
          correlationId: resolveSensitiveAuditCorrelation(
            req.headers.get("x-tecpey-request-id"),
          ),
          requestHash: hashSensitiveAuditRequest({
            tenantId: tenantContext.tenantId,
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
