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

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/commerce/billing" }, async () => {
    const limit = await rateLimit(req, { namespace: "commerce-billing-read", limit: 60, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (session.authorityDegraded) return apiError("commerce_billing_unavailable", 503);
    const accountId = session.academyAccountId;
    if (!accountId) return apiError("unauthorized", 401);

    const context = await resolveTenantPrincipalContext({
      session,
      request: req,
      requiredPrincipalType: "account",
      scopes: ["commerce:billing:read"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!context.available) {
      if (context.reason === "binding_storage_unavailable") return apiError("commerce_billing_unavailable", 503);
      return apiError("forbidden", 403);
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
      if (!result.enabled) return apiError("commerce_billing_unavailable", 503);
      return apiOk({ billing: result.value });
    } catch {
      return apiError("commerce_billing_unavailable", 503);
    }
  });
}
