import { NextRequest } from "next/server";
import { apiOk, apiError, apiRateLimited } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import {
  computeMentorProfileForStudentTx,
  upsertMentorProfileUpdateTx,
} from "@/lib/mentor-profile-recompute-authority";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";
import { rateLimit } from "@/lib/rate-limit";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
  writeSensitiveMutationAuditTx,
} from "@/lib/security/sensitive-mutation-audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);

  const session = await getCanonicalSession(req, { strictRevocation: true });
  if (!session.studentId) return apiError("academy_profile_required", 401);
  const tenantContext = await resolveTenantPrincipalContext({
    session,
    request: req,
    requiredPrincipalType: "student",
    scopes: ["academy:learning-events:write"],
    requestId: resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    ),
  });
  if (!tenantContext.available) {
    return apiError(
      tenantContext.reason === "binding_storage_unavailable"
        ? "mentor_profile_recompute_unavailable"
        : "forbidden",
      tenantContext.reason === "binding_storage_unavailable" ? 503 : 403,
    );
  }
  const productGate = await requireTenantProduct(tenantContext.tenantId, "mentor");
  if (productGate) return productGate;
  const studentId = tenantContext.principalId;

  const limit = await rateLimit(req, {
    namespace: "mentor-profile-recompute",
    identity: studentId,
    limit: 6,
    windowMs: 60_000,
  });
  if (!limit.ok) return apiRateLimited(limit.retryAfterSeconds);

  const correlationId = resolveSensitiveAuditCorrelation(
    req.headers.get("x-tecpey-request-id"),
  );

  try {
    const stored = await withTx(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(
           hashtext('mentor_profile_projection'),
           hashtext($1)
         )`,
        [studentId],
      );
      const updated = await computeMentorProfileForStudentTx(client, studentId);
      const requestHash = hashSensitiveAuditRequest({
        studentId,
        level: updated.level,
        riskProfile: updated.riskProfile,
        primaryGoalHash: hashSensitiveAuditRequest(updated.primaryGoal),
        weakAreasHash: hashSensitiveAuditRequest(updated.weakAreas),
        strongAreasHash: hashSensitiveAuditRequest(updated.strongAreas),
        confidenceScore: updated.confidenceScore,
        disciplineScore: updated.disciplineScore,
        learningStyle: updated.learningStyle,
      });

      await upsertMentorProfileUpdateTx(client, studentId, updated);
      await writeSensitiveMutationAuditTx(client, {
        tenantId: tenantContext.tenantId,
        actorType: "student",
        actorId: studentId,
        action: "mentor_profile.recompute",
        resourceType: "mentor_profile",
        resourceId: studentId,
        outcome: "success",
        correlationId,
        requestHash,
        metadata: {
          level: updated.level,
          riskProfile: updated.riskProfile,
          confidenceScore: updated.confidenceScore,
          disciplineScore: updated.disciplineScore,
          learningStyle: updated.learningStyle,
          weakAreaCount: updated.weakAreas.length,
          strongAreaCount: updated.strongAreas.length,
        },
      });
      return updated;
    });

    if (!stored.enabled) return apiError("storage_unavailable", 503);
    const updated = stored.value;
    return apiOk({
      profile: {
        level: updated.level,
        riskProfile: updated.riskProfile,
        primaryGoal: updated.primaryGoal,
        weakAreas: updated.weakAreas,
        strongAreas: updated.strongAreas,
        confidenceScore: updated.confidenceScore,
        disciplineScore: updated.disciplineScore,
        learningStyle: updated.learningStyle,
      },
    });
  } catch {
    return apiError("mentor_profile_recompute_unavailable", 503);
  }
}
