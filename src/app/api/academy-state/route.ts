import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withTx } from "@/lib/db";
import { rateLimitUser } from "@/lib/rate-limit";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { refreshAcademyProgressProjection } from "@/lib/academy-progress-projection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLocale(value: unknown): "fa" | "en" {
  return value === "en" ? "en" : "fa";
}

function stableValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 2_000);
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => stableValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 200)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key.slice(0, 200), stableValue(item, depth + 1)]),
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-state" }, async () => {
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);
    const limit = await rateLimitUser(req, {
      namespace: "academy-state-read",
      limit: 120,
      windowMs: 60_000,
      userId: session.studentId,
    });
    if (!limit.ok) return apiError("rate_limited", 429);
    const locale = parseLocale(new URL(req.url).searchParams.get("locale"));

    const result = await withTx((client) =>
      refreshAcademyProgressProjection(client, session.studentId as string, locale),
    );
    if (!result.enabled) return apiError("progress_service_not_configured", 503);
    return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

/**
 * One-time authenticated quarantine for pre-authority browser progress. The
 * payload is preserved for review only and can never overwrite the current
 * server projection, XP ledger, lesson completion, certificate, or Arena gate.
 */
export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-state" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    if (!checkBodySize(req.headers.get("content-length"), 64_000)) {
      return apiError("payload_too_large", 413);
    }
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);
    const limit = await rateLimitUser(req, {
      namespace: "academy-state-legacy-import",
      limit: 4,
      windowMs: 60_000,
      userId: session.studentId,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return apiError("invalid_json", 400);
    }
    const locale = parseLocale(body.locale);
    if (!body.legacySnapshot || typeof body.legacySnapshot !== "object" || Array.isArray(body.legacySnapshot)) {
      return apiError("invalid_legacy_snapshot", 400);
    }
    const snapshot = stableValue(body.legacySnapshot) as Record<string, unknown>;
    const serialized = JSON.stringify(snapshot);
    if (serialized.length < 2 || Buffer.byteLength(serialized, "utf8") > 60_000) {
      return apiError("invalid_legacy_snapshot", 400);
    }
    const snapshotHash = createHash("sha256").update(serialized).digest("hex");

    const result = await withTx(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('academy_legacy_progress_import'), hashtext($1))`,
        [`${session.studentId}:${locale}`],
      );
      const inserted = await client.query<{ student_id: string }>(
        `INSERT INTO academy_progress_legacy_snapshots
          (student_id, locale, snapshot, snapshot_hash, reconciliation_status, reconciliation_report)
         VALUES ($1::uuid, $2, $3::jsonb, $4, 'quarantined', $5::jsonb)
         ON CONFLICT (student_id, locale) DO NOTHING
         RETURNING student_id::text`,
        [
          session.studentId,
          locale,
          serialized,
          snapshotHash,
          JSON.stringify({
            source: "browser_legacy_import_v1",
            authorityApplied: false,
            reason: "client_mutable_state_requires_review",
            importedAt: new Date().toISOString(),
          }),
        ],
      );
      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload)
         VALUES ($1::uuid, 'legacy_progress_quarantined', $2::jsonb)`,
        [
          session.studentId,
          JSON.stringify({
            locale,
            snapshotHash,
            inserted: Boolean(inserted.rows[0]),
            authorityApplied: false,
          }),
        ],
      );
      const projection = await refreshAcademyProgressProjection(
        client,
        session.studentId as string,
        locale,
      );
      return {
        imported: Boolean(inserted.rows[0]),
        authorityApplied: false as const,
        reconciliationStatus: "quarantined" as const,
        state: projection.state,
        revision: projection.revision,
      };
    });

    if (!result.enabled) return apiError("progress_service_not_configured", 503);
    return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
