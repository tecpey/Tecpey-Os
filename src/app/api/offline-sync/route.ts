import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { withTx } from "@/lib/db";
import {
  normalizeOfflineSyncItem,
  offlineManifest,
  type OfflineSyncItem,
  type OfflineSyncResult,
} from "@/lib/offline-sync";
import { applyOfflineSyncBatch } from "@/lib/offline-sync-server";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

const PRIVATE_NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Vary: "Cookie",
};

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/offline-sync" }, async () => {
    const url = new URL(req.url);
    const locale =
      cleanText(url.searchParams.get("locale") || "fa", 8) === "en"
        ? "en"
        : "fa";
    return apiOk({ manifest: offlineManifest(locale) }, 200, PRIVATE_NO_STORE);
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/offline-sync" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "offline-sync",
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, {
      strictRevocation: true,
    });
    if (!session.studentId) return apiError("academy_profile_required", 401);
    const studentId = session.studentId;

    let body: unknown;
    try {
      const raw = await req.text();
      if (raw.length > 80_000) return apiError("payload_too_large", 413);
      body = JSON.parse(raw || "{}");
    } catch {
      return apiError("invalid_json", 400);
    }

    const rawItems =
      body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)
        ? (body as { items: unknown[] }).items.slice(0, 50)
        : [];
    if (rawItems.length === 0) {
      return apiOk(
        { accepted: 0, rejected: 0, results: [] },
        200,
        PRIVATE_NO_STORE,
      );
    }

    const valid: OfflineSyncItem[] = [];
    const rejected: OfflineSyncResult[] = [];
    for (const rawItem of rawItems) {
      const parsed = normalizeOfflineSyncItem(rawItem);
      if (!parsed.ok) {
        rejected.push({
          id: parsed.id || "unknown",
          status: "rejected",
          reason: parsed.reason,
        });
      } else {
        valid.push(parsed.item);
      }
    }

    if (valid.length === 0) {
      return apiOk(
        { accepted: 0, rejected: rejected.length, results: rejected },
        200,
        PRIVATE_NO_STORE,
      );
    }

    try {
      const committed = await withTx((client) =>
        applyOfflineSyncBatch(client, studentId, valid),
      );
      if (!committed.enabled) {
        return apiError("offline_sync_storage_unavailable", 503, {
          retryable: true,
        });
      }

      const results = [...rejected, ...committed.value];
      return apiOk(
        {
          accepted: committed.value.filter((item) => item.status === "accepted")
            .length,
          rejected: results.filter((item) => item.status === "rejected").length,
          results,
        },
        200,
        PRIVATE_NO_STORE,
      );
    } catch {
      return apiError("offline_sync_storage_unavailable", 503, {
        retryable: true,
      });
    }
  });
}
