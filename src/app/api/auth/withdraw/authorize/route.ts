import { NextRequest } from "next/server";
import { withTx } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/security/audit-log";
import { decryptTotpSecret, verifyTotpStep } from "@/lib/security/totp";
import {
  canonicalizeWithdrawalCommand,
  issueWithdrawalAuthorizationTx,
  WITHDRAWAL_ADMISSION_POLICY_VERSION,
} from "@/lib/security/withdrawal-admission-authority";

export const dynamic = "force-dynamic";

type AuthorizationTransactionResult =
  | { status: "issued"; authorization: { id: string; expiresAt: Date } }
  | { status: "2fa_required" }
  | { status: "invalid_totp" }
  | { status: "2fa_secret_corrupt" }
  | { status: "authorization_store_unavailable" };

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

      try {
        const issued = await withTx<AuthorizationTransactionResult>(async (db) => {
          const factor = await db.query<{ encrypted_secret: string }>(
            `SELECT encrypted_secret
               FROM user_2fa
              WHERE user_id = $1
                AND enabled = TRUE
              FOR UPDATE`,
            [userId],
          );
          const row = factor.rows[0];
          if (!row) return { status: "2fa_required" };

          let step: number | null;
          try {
            step = verifyTotpStep(decryptTotpSecret(row.encrypted_secret), code);
          } catch {
            return { status: "2fa_secret_corrupt" };
          }
          if (step === null) return { status: "invalid_totp" };

          const authorization = await issueWithdrawalAuthorizationTx(db, {
            userId,
            requestHash: canonical.requestHash,
            verificationStep: step,
          });
          if (!authorization) {
            return { status: "authorization_store_unavailable" };
          }

          const touched = await db.query(
            `UPDATE user_2fa
                SET last_used_at = NOW()
              WHERE user_id = $1
                AND enabled = TRUE
              RETURNING user_id`,
            [userId],
          );
          if ((touched.rowCount ?? 0) !== 1) {
            throw new Error("withdrawal_2fa_disabled_during_authorization");
          }
          return { status: "issued", authorization };
        });
        if (!issued.enabled) return apiError("db_unavailable", 503);

        if (issued.value.status === "2fa_required") {
          return apiError("2fa_required", 403);
        }
        if (issued.value.status === "2fa_secret_corrupt") {
          return apiError("2fa_secret_corrupt", 500);
        }
        if (issued.value.status === "authorization_store_unavailable") {
          return apiError("authorization_store_unavailable", 503);
        }
        if (issued.value.status === "invalid_totp") {
          writeAudit({
            actorId: userId,
            action: "wallet_withdrawal",
            ip: getClientIp(req),
            metadata: {
              event: "withdrawal_authorization_failed",
              reason: "invalid_totp",
              requestHash: canonical.requestHash,
            },
          });
          return apiError("invalid_totp_code", 401);
        }

        writeAudit({
          actorId: userId,
          action: "wallet_withdrawal",
          ip: getClientIp(req),
          userAgent: (req.headers.get("user-agent") ?? "").slice(0, 500),
          metadata: {
            event: "withdrawal_authorized",
            authorizationId: issued.value.authorization.id,
            requestHash: canonical.requestHash,
            policyVersion: WITHDRAWAL_ADMISSION_POLICY_VERSION,
            expiresAt: issued.value.authorization.expiresAt.toISOString(),
          },
        });
        return apiOk({
          authorizationId: issued.value.authorization.id,
          requestHash: canonical.requestHash,
          expiresAt: issued.value.authorization.expiresAt.toISOString(),
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
