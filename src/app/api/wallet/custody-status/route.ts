import { NextRequest } from "next/server";
import { apiOk } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { getCustodyLaunchStatus } from "@/lib/wallet/custody-launch-policy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/wallet/custody-status GET" },
    async () => {
      const limited = await rateLimit(req, {
        namespace: "wallet-custody-status",
        limit: 60,
        windowMs: 60_000,
      });
      if (!limited.ok) {
        const response = apiOk({
          available: false,
          productionReady: false,
          depositsAvailable: false,
          withdrawalsAvailable: false,
          reason: "temporarily_unavailable",
        }, 429);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
      }

      const status = getCustodyLaunchStatus();
      const response = apiOk({
        available: status.enabled,
        productionReady: status.productionReady,
        depositsAvailable: status.depositAddressAllocationEnabled,
        withdrawalsAvailable:
          status.withdrawalApprovalEnabled &&
          status.workerEnabled &&
          status.signingEnabled &&
          status.broadcastEnabled,
        reason: status.enabled
          ? null
          : status.reasons[0] ?? "custody_not_production_ready",
        enabledChains: status.enabledChains,
      });
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    },
  );
}
