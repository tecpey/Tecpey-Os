import { NextRequest } from "next/server";
import { withTx, withDb } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/security/audit-log";
import { decryptTotpSecret, verifyTotpStep } from "@/lib/security/totp";
import {
  canonicalizeWithdrawalCommand,
  WITHDRAWAL_ADMISSION_POLICY_VERSION,
  WITHDRAWAL_AUTHORIZATION_TTL_SECONDS,
} from "@/lib/security/withdrawal-admission-authority";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/auth/withdraw/authorize POST" },
    async () => {
      if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

      const session = await getCanonicalSession(req, { strictRevocation: true });
      const userId = session.academyAccountId ?? session.userId ?? session.studentId;
      if (!userId) return apiError("authentication_required", 401);

      const limited = await rateLimit(req, {
        namespace: "withdraw-authorize",
        identity: userId,
        limit: 5,
        windowMs: 5 * 60_000,
      });
      if (!limited.ok) return apiError("rate_limited", 429);

      const body = await req.json().catch(() => ({}));
      const code = typeof body.code === "string" ? body.code.trim() : "";
      if (!/^\d{6}$/.test(code)) return apiError("invalid_code_format", 400);

      const canonical = canonicalizeWithdrawalCommand({
        userId,
        asset: typeof body.asset === "string" ? body.asset : "",
        amount: typeof body.amount === "string" ? body.amount : "",
        destinationAddress:
          typeof body.destinationAddress === "string" ? body.destinationAddress : "",
        destinationTag:
          typeof body.destinationTag === "string" ? body.destinationTag : null,
        network: typeof body.network === "string" ? body.network : "",
        idempotencyKey:
          typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
      });
      if (!canonical.ok) return apiError(canonical.reason, 400);

      const factor = await withDb(async (db) => {
        const result = await db.query<{ encrypted_secret: string }>(
          `SELECT encrypted_secret
             FROM user_2fa
            WHERE user_id = $1
              AND enabled = TRUE`,
          [userId],
        );
        return result.rows[0] ?? null;
      });
      if (!factor.enabled) return apiError("db_unavailable", 503);
      if (!factor.value) return apiError("2fa_required", 403);

      let step: number | null = null;
      try {
        step = verifyTotpStep(
          decryptTotpSecret(factor.value.encrypted_secret),
          code,
        );
      } catch {
        return apiError("2fa_secret_corrupt", 500);
      }
      if (step === null) {
        writeAudit({
          actorId: userId,
          action: "withdrawal_authorization_failed",
          ip: getClientIp(req),
          metadata: { reason: "invalid_totp", requestHash: canonical.requestHash },
        });
        return apiError("invalid_totp_code", 401);
      }

      const expiresAt = new Date(
        Date.now() + WITHDRAWAL_AUTHORIZATION_TTL_SECONDS * 1000,
      );
      try {
        const issued = await withTx(async (db) => {
          const inserted = await db.query<{ id: string }>(
            `INSERT INTO withdrawal_authorizations
               (user_id, request_hash, verification_step, policy_version, expires_at)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [
              userId,
              canonical.requestHash,
              step,
              WITHDRAWAL_ADMISSION_POLICY_VERSION,
              expiresAt,
            ],
          );
          await db.query(
            `UPDATE user_2fa
                SET last_used_at = NOW()
              WHERE user_id = $1
                AND enabled = TRUE`,
            [userId],
          );
          return inserted.rows[0]?.id ?? null;
        });
        if (!issued.enabled || !issued.value) {
          return apiError("authorization_store_unavailable", 503);
        }

        writeAudit({
          actorId: userId,
          action: "withdrawal_authorized",
          ip: getClientIp(req),
          userAgent: (req.headers.get("user-agent") ?? "").slice(0, 500),
          metadata: {
            authorizationId: issued.value,
            requestHash: canonical.requestHash,
            policyVersion: WITHDRAWAL_ADMISSION_POLICY_VERSION,
            expiresAt: expiresAt.toISOString(),
          },
        });
        return apiOk({
          authorizationId: issued.value,
          requestHash: canonical.requestHash,
          expiresAt: expiresAt.toISOString(),
        });
      } catch (error) {
        const codeValue =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code?: unknown }).code ?? "")
            : "";
        if (codeValue === "23505") {
          return apiError("totp_code_already_used", 409);
        }
        return apiError("authorization_store_unavailable", 503);
      }
    },
  );
}
