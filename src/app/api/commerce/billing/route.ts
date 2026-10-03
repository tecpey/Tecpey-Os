import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { readCommerceBillingAuthority } from "@/lib/commerce/commerce-billing-authority";
import { withDb } from "@/lib/db";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";

export const dynamic = "force-dynamic";

const BILLING_PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Vary: "Cookie",
} as const;

function billingError(error: string, status: number) {
  return apiError(error, status, undefined, BILLING_PRIVATE_HEADERS);
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/commerce/billing" }, async () => {
    // Billing is a zero-query authenticated authority. Reject every query key
    // rather than silently accepting future client-selected authority inputs.
    if ([...req.nextUrl.searchParams.keys()].length > 0) {
      return billingError("invalid_query", 400);
    }
    const limit = await rateLimit(req, { namespace: "commerce-billing-read", limit: 60, windowMs: 60_000 });
    if (!limit.ok) return billingError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (session.authorityDegraded) return billingError("commerce_billing_unavailable", 503);
    const accountId = session.academyAccountId;
    if (!accountId) return billingError("unauthorized", 401);

    const context = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "account",
      scopes: ["commerce:billing:read"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!context.available) {
      if (context.reason === "binding_storage_unavailable") return billingError("commerce_billing_unavailable", 503);
      return billingError("forbidden", 403);
    }

    try {
      const result = await withDb(async (client) => {
        await client.query("BEGIN");
        try {
          await client.query(
            "SELECT set_config('app.tenant_id',$1,true),set_config('app.workspace_id',$2,true)",
            [context.tenantId, context.workspaceId],
          );
          const authority = await readCommerceBillingAuthority(client, {
            tenantId: context.tenantId, workspaceId: context.workspaceId, accountId,
          });
          await client.query("COMMIT");
          return authority;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
      });
      if (!result.enabled) return billingError("commerce_billing_unavailable", 503);
      return apiOk({ billing: result.value }, 200, BILLING_PRIVATE_HEADERS);
    } catch {
      return billingError("commerce_billing_unavailable", 503);
    }
  });
}
