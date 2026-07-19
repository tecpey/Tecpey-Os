import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { normalizeOfflineSyncItem, offlineManifest, type OfflineSyncResult } from "@/lib/offline-sync";
import { processOfflineSyncCommand } from "@/lib/offline-sync-authority";
import { resolvePlatformContext } from "@/lib/tenant-service";
import { writeAudit } from "@/lib/security/audit-log";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/offline-sync" }, async () => {
    const url = new URL(req.url);
    const locale = cleanText(url.searchParams.get("locale") || "fa", 8) === "en" ? "en" : "fa";
    return apiOk({ manifest: offlineManifest(locale) });
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/offline-sync" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    const limit = await rateLimit(req, { namespace: "offline-sync", limit: 30, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("academy_profile_required", 401);

    try {
      const raw = await req.text();
      if (raw.length > 80_000) return apiError("payload_too_large", 413);
      const body = JSON.parse(raw || "{}");
      const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
      if (!items.length) return apiError("items_required", 400);

      const platform = await resolvePlatformContext(session);
      const results: OfflineSyncResult[] = [];

      for (const input of items) {
        const normalized = normalizeOfflineSyncItem(input);
        if (!normalized.ok) {
          results.push({
            id: normalized.id || "unknown",
            status: "rejected",
            reason: normalized.reason,
          });
          continue;
        }

        results.push(
          await processOfflineSyncCommand({
            tenantId: platform.tenantId,
            studentId: session.studentId,
            item: normalized.item,
          }),
        );
      }

      const committed = results.filter((result) => result.status === "committed").length;
      const replayed = results.filter(
        (result) => result.status === "committed" && result.replayed === true,
      ).length;
      const rejected = results.filter((result) => result.status === "rejected").length;
      const retryable = results.filter((result) => result.status === "retryable").length;

      writeAudit({
        actorId: session.studentId,
        action: "offline_sync",
        ip: getClientIp(req),
        userAgent: req.headers.get("user-agent") || "",
        metadata: {
          tenantId: platform.tenantId,
          attempted: items.length,
          committed,
          replayed,
          rejected,
          retryable,
        },
      });

      const payload = {
        attempted: items.length,
        accepted: committed,
        committed,
        replayed,
        rejected,
        retryable,
        results,
      };

      if (retryable === results.length) {
        return apiError("offline_sync_storage_unavailable", 503, payload);
      }

      const response = apiOk(payload, retryable > 0 ? 207 : 200);
      response.headers.set("Cache-Control", "no-store, private");
      return response;
    } catch (error) {
      if (error instanceof SyntaxError) return apiError("invalid_json", 400);
      return apiError("server_error", 500);
    }
  });
}
