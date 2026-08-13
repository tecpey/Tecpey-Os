import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
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
    const session = await getStudentSessionFromRequest(req);
    const studentId = cleanText(session?.studentId, 80);
    if (!studentId) return apiOk({ degraded: false, certificates: [] });
    try {
      const result = await withDb(async (client) => {
        const rows = await client.query(`SELECT * FROM academy_certificates WHERE student_id = $1::uuid ORDER BY term_number ASC`, [studentId]);
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
