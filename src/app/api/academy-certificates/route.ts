import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { getCanonicalSession } from "@/lib/auth-session";
import { issueCertificate } from "@/lib/academy-certificates";
import { awardMilestonesAfterCertificate } from "@/lib/phase5-achievement-engine";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { recordDegradedRead } from "@/lib/degraded-read";

const ROUTE = "/api/academy-certificates";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: ROUTE }, async () => {
    const limit = await rateLimit(req, { namespace: "academy-certificates-read", limit: 80, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    // academy_certificates carries a tenant boundary (migration 0070), so the
    // student's own list has to be read inside the tenant they are acting in.
    // Keyed by student_id alone, a student bound to two tenants saw both
    // tenants' certificates in whichever one they happened to open — their own
    // data, but presented as if one tenant had issued all of it.
    //
    // This resolves the same verified context the POST on this route already
    // uses. The narrower effect is that a browser still holding only a legacy
    // student cookie no longer lists certificates: those cookies stopped being
    // issued in Phase 23, and a retired credential should not carry a
    // tenant-scoped read.
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) {
      // Only an unreachable authority makes an empty answer a lie. A visitor
      // with no cookie, an expired or revoked one, or a valid account-only
      // session issued before the student profile exists (academy-auth signs
      // exactly that on login) all genuinely have no certificates to list, and
      // reporting an outage for them would both mislead the reader and emit a
      // false outage metric.
      if (session.authorityDegraded) {
        recordDegradedRead(ROUTE, "session_authority_unavailable");
        return apiOk({ degraded: true, certificates: [] });
      }
      return apiOk({ degraded: false, certificates: [] });
    }
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:read"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) {
      recordDegradedRead(ROUTE, "tenant_context_unavailable");
      return apiOk({ degraded: true, certificates: [] });
    }
    const studentId = cleanText(tenantContext.principalId, 80);
    if (!studentId) return apiOk({ degraded: false, certificates: [] });
    try {
      const result = await withDb(async (client) => {
        const rows = await client.query(
          `SELECT * FROM academy_certificates
            WHERE tenant_id = $2 AND workspace_id = $3 AND student_id = $1::uuid
            ORDER BY term_number ASC`,
          [studentId, tenantContext.tenantId, tenantContext.workspaceId],
        );
        return rows.rows;
      });
      if (!result.enabled) {
        recordDegradedRead(ROUTE, "storage_unavailable");
        return apiOk({ degraded: true, certificates: [] });
      }
      return apiOk({ degraded: false, certificates: result.value });
    } catch (error) {
      recordDegradedRead(ROUTE, "read_failed", error);
      return apiOk({ degraded: true, certificates: [] });
    }
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-certificates" }, async () => {
    if (!verifyCsrfOrigin(req))
      return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "academy-certificates-issue", limit: 12, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);
    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:learning-events:write"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) return apiError("learning_events_unavailable", 503);
    const studentId = cleanText(tenantContext.principalId, 80);
    try {
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 2_048,
        allowEmptyObject: true,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      req = boundedBodyRequest.request;
      const body = await req.json().catch(() => ({}));
      const termNumber = Number(body.termNumber || 1);
      const result = await withDb(async (client) => {
        await client.query(
          `INSERT INTO academy_student_events (student_id, event_type, payload) VALUES ($1::uuid, 'certificate_requested', $2::jsonb)`,
          [studentId, JSON.stringify({ termNumber, ip: getClientIp(req), source: "server_verified_progress" })],
        );
        const certificate = await issueCertificate(client, {
          studentId,
          termNumber,
          tenantId: tenantContext.tenantId,
          workspaceId: tenantContext.workspaceId,
        });
        await awardMilestonesAfterCertificate(client, studentId, termNumber, String(certificate.id), {
          tenantId: tenantContext.tenantId,
          workspaceId: tenantContext.workspaceId,
        });
        return certificate;
      });
      if (!result.enabled) return apiError("certificate_service_unavailable", 503);
      return apiOk({ certificate: result.value });
    } catch (error) {
      const message = error instanceof Error ? error.message : "server_error";
      if (message === "term_not_verified") return apiError("term_not_verified", 403);
      if (message === "certificate_signing_secret_missing") return apiError("certificate_service_not_configured", 503);
      return apiError("server_error", 500);
    }
  });
}
