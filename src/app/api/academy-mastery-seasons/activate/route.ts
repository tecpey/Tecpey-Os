import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiError, apiOk } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { activateAcademyMasterySeason } from "@/lib/academy-mastery-seasons-authority";
import { rateLimit } from "@/lib/rate-limit";
import { withObservability } from "@/lib/observe";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/academy-mastery-seasons/activate";
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,120}$/;
const SEASON_ID = /^[a-z0-9][a-z0-9-]{2,80}$/;

function noStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: ROUTE }, async () => {
    if (!await verifyCsrfOrigin(req)) return noStore(apiError("forbidden", 403));

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return noStore(apiError("complete_account_required", 401));

    const limit = await rateLimit(req, {
      namespace: "academy-mastery-seasons-activate",
      identity: session.studentId,
      limit: 12,
      windowMs: 60_000,
    });
    if (!limit.ok) return noStore(apiError("rate_limited", 429));

    const tenantContext = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "student",
      scopes: ["academy:mastery-seasons:write"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) return noStore(apiError("mastery_seasons_unavailable", 503));
    const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
    if (productGate) return noStore(productGate);

    if ([...new URL(req.url).searchParams.keys()].length > 0) {
      return noStore(apiError("unsupported_query_parameter", 400));
    }

    const bounded = await readBoundedJsonRequest<Record<string, unknown>>(req, {
      maxBytes: 2_048,
    });
    if (!bounded.ok) return noStore(apiError(bounded.error, bounded.status));
    const body = bounded.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return noStore(apiError("invalid_mastery_season_activation", 400));
    }
    const bodyKeys = Object.keys(body).sort();
    if (
      bodyKeys.length !== 2 ||
      bodyKeys[0] !== "locale" ||
      bodyKeys[1] !== "seasonId" ||
      (body.locale !== "fa" && body.locale !== "en") ||
      typeof body.seasonId !== "string" ||
      !SEASON_ID.test(body.seasonId)
    ) {
      return noStore(apiError("invalid_mastery_season_activation", 400));
    }
    const locale = body.locale as "fa" | "en";
    const seasonId = body.seasonId as string;

    const idempotencyKey = req.headers.get("idempotency-key")?.trim() ?? "";
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return noStore(apiError("idempotency_key_required", 400));
    }

    try {
      const result = await withTx(async (client) => {
        await client.query(
          `SELECT pg_advisory_xact_lock(
             hashtext('academy_mastery_season_activation'),
             hashtext($1)
           )`,
          [`${tenantContext.tenantId}:${tenantContext.workspaceId}:${tenantContext.principalId}:${locale}:${seasonId}`],
        );
        return activateAcademyMasterySeason({
          client,
          scope: tenantContext,
          studentId: tenantContext.principalId,
          locale,
          seasonId,
          idempotencyKey,
        });
      });
      if (!result.enabled) return noStore(apiError("mastery_seasons_service_not_configured", 503));
      return noStore(apiOk({
        assignment: result.value.assignment,
        state: result.value.state,
        changed: result.value.changed,
        replayed: !result.value.changed,
      }, result.value.changed ? 201 : 200));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "mastery_season_unknown") {
        return noStore(apiError("mastery_season_not_found", 404));
      }
      if (code === "mastery_core_terms_incomplete" || code === "mastery_season_not_eligible") {
        return noStore(apiError(code, 409));
      }
      return noStore(apiError("mastery_seasons_unavailable", 503));
    }
  });
}
