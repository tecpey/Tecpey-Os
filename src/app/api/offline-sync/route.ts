import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import {
  normalizeOfflineSyncItem,
  offlineManifest,
  type OfflineSyncResult,
} from "@/lib/offline-sync";
import {
  processOfflineSyncCommand as idempotencyProcessOfflineSyncCommand,
} from "@/lib/offline-sync-authority";
import {
  issueOfflineSyncScope,
  verifyOfflineSyncScope,
} from "@/lib/offline-sync-scope";
import { resolvePlatformContext } from "@/lib/tenant-service";
import { logger } from "@/lib/logger";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

function resultId(input: unknown): string {
  if (!input || typeof input !== "object") return "unknown";
  return cleanText((input as Record<string, unknown>).id, 160) || "unknown";
}

function offlineTelemetryFingerprint(
  domain: "student" | "tenant",
  value: string,
): string {
  return createHash("sha256")
    .update(`tecpey:offline-sync-${domain}:v1\0`)
    .update(value)
    .digest("hex");
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/offline-sync GET" }, async () => {
    const url = new URL(req.url);
    const locale = cleanText(url.searchParams.get("locale") || "fa", 8) === "en" ? "en" : "fa";
    const session = await getCanonicalSession(req, { strictRevocation: true });

    let scope: { token: string; expiresAt: string } | null = null;
    if (session.studentId) {
      const platform = await resolvePlatformContext(session);
      scope = issueOfflineSyncScope({
        tenantId: platform.tenantId,
        studentId: session.studentId,
      });
      if (!scope) return apiError("offline_scope_authority_unavailable", 503);
    }

    const response = apiOk({
      manifest: offlineManifest(locale),
      scopeToken: scope?.token ?? null,
      scopeExpiresAt: scope?.expiresAt ?? null,
    });
    response.headers.set("Cache-Control", "no-store, private");
    return response;
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/offline-sync POST" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("academy_profile_required", 401);
    const platform = await resolvePlatformContext(session);

    const limit = await rateLimit(req, {
      namespace: "offline-sync",
      identity: `${platform.tenantId}:${session.studentId}`,
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    try {
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 320_000,
        allowEmptyObject: true,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      req = boundedBodyRequest.request;
      const raw = await req.text();
      if (raw.length > 80_000) return apiError("payload_too_large", 413);
      const body = JSON.parse(raw || "{}");
      const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
      if (!items.length) return apiError("items_required", 400);

      const results: OfflineSyncResult[] = [];
      for (const input of items) {
        const record =
          input && typeof input === "object" ? (input as Record<string, unknown>) : {};
        const id = resultId(input);
        const scopeToken = typeof record.scopeToken === "string" ? record.scopeToken : "";
        const scope = verifyOfflineSyncScope(scopeToken);

        if (scope.status === "unavailable") {
          results.push({
            id,
            status: "retryable",
            reason: "scope_authority_unavailable",
          });
          continue;
        }
        if (scope.status === "invalid" || scope.status === "expired") {
          results.push({
            id,
            status: "rejected",
            reason:
              scope.status === "expired"
                ? "principal_scope_expired"
                : "principal_scope_invalid",
          });
          continue;
        }
        if (
          scope.scope.tenantId !== platform.tenantId ||
          scope.scope.studentId !== session.studentId
        ) {
          // Keep another principal's command in the browser queue until that
          // principal signs in again; never apply it to the current account.
          results.push({
            id,
            status: "retryable",
            reason: "principal_scope_mismatch",
          });
          continue;
        }

        const normalized = normalizeOfflineSyncItem(input);
        if (!normalized.ok) {
          results.push({
            id: normalized.id || id,
            status: "rejected",
            reason: normalized.reason,
          });
          continue;
        }

        results.push(
          await idempotencyProcessOfflineSyncCommand({
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

      logger.info("[offline-sync] batch processed", {
        studentFingerprint: offlineTelemetryFingerprint(
          "student",
          session.studentId,
        ),
        tenantFingerprint: offlineTelemetryFingerprint(
          "tenant",
          platform.tenantId,
        ),
        attempted: items.length,
        committed,
        replayed,
        rejected,
        retryable,
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
      const authorityUnavailable = results.every(
        (result) =>
          result.status === "retryable" &&
          ["storage_unavailable", "scope_authority_unavailable"].includes(
            result.reason ?? "",
          ),
      );
      if (authorityUnavailable) {
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
