import { NextRequest } from "next/server";
import { withTx } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  claimApiCommandTx,
  completeApiCommandTx,
  hashApiCommand,
  parseApiIdempotencyKey,
  type ApiCommandScope,
} from "@/lib/security/api-command-idempotency";
import { writeAudit } from "@/lib/security/audit-log";
import { decryptTotpSecret, verifyTotpStep } from "@/lib/security/totp";
import {
  canonicalizeWithdrawalCommand,
  issueWithdrawalAuthorizationTx,
  WITHDRAWAL_ADMISSION_POLICY_VERSION,
} from "@/lib/security/withdrawal-admission-authority";

export const dynamic = "force-dynamic";

type AuthorizationReceipt = {
  outcome: "issued" | "2fa_required" | "invalid_totp";
  authorizationId?: string;
  expiresAt?: string;
  withdrawalRequestHash: string;
};

type AuthorizationTransactionResult = {
  receipt: AuthorizationReceipt;
  replayed: boolean;
};

class AuthorizationDependencyError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

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

      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      const code = typeof body.code === "string" ? body.code.trim() : "";
      if (!/^\d{6}$/.test(code)) return apiError("invalid_code_format", 400);

      const idempotencyKey = parseApiIdempotencyKey(
        req.headers.get("Idempotency-Key"),
        body.idempotencyKey,
      );
      if (!idempotencyKey) return apiError("idempotency_key_required", 400);

      const canonical = canonicalizeWithdrawalCommand({
        userId,
        asset: typeof body.asset === "string" ? body.asset : "",
        amount: typeof body.amount === "string" ? body.amount : "",
        destinationAddress:
          typeof body.destinationAddress === "string" ? body.destinationAddress : "",
        destinationTag:
          typeof body.destinationTag === "string" ? body.destinationTag : null,
        network: typeof body.network === "string" ? body.network : "",
        idempotencyKey,
      });
      if (!canonical.ok) return apiError(canonical.reason, 400);

      const receiptScope: ApiCommandScope = {
        principalType: "user",
        principalId: userId,
        operation: "withdrawal.authorize",
        idempotencyKey,
        requestHash: hashApiCommand({
          withdrawalRequestHash: canonical.requestHash,
          totpCodeHash: hashApiCommand(code),
        }),
      };

      try {
        const issued = await withTx<AuthorizationTransactionResult>(async (db) => {
          const claim = await claimApiCommandTx<AuthorizationReceipt>(
            db,
            receiptScope,
          );
          if (claim.status === "conflict") {
            return {
              receipt: {
                outcome: "invalid_totp",
                withdrawalRequestHash: "idempotency_conflict",
              },
              replayed: false,
            };
          }
          if (claim.status === "in_progress") {
            throw new AuthorizationDependencyError("idempotency_in_progress");
          }
          if (claim.status === "replayed") {
            return { receipt: claim.response, replayed: true };
          }

          const factor = await db.query<{ encrypted_secret: string }>(
            `SELECT encrypted_secret
               FROM user_2fa
              WHERE user_id = $1
                AND enabled = TRUE
              FOR UPDATE`,
            [userId],
          );
          const row = factor.rows[0];
          if (!row) {
            const receipt: AuthorizationReceipt = {
              outcome: "2fa_required",
              withdrawalRequestHash: canonical.requestHash,
            };
            await completeApiCommandTx(db, receiptScope, {
              httpStatus: 403,
              response: receipt,
            });
            return { receipt, replayed: false };
          }

          let step: number | null;
          try {
            step = verifyTotpStep(decryptTotpSecret(row.encrypted_secret), code);
          } catch {
            throw new AuthorizationDependencyError("2fa_secret_corrupt");
          }
          if (step === null) {
            const receipt: AuthorizationReceipt = {
              outcome: "invalid_totp",
              withdrawalRequestHash: canonical.requestHash,
            };
            await completeApiCommandTx(db, receiptScope, {
              httpStatus: 401,
              response: receipt,
            });
            return { receipt, replayed: false };
          }

          const authorization = await issueWithdrawalAuthorizationTx(db, {
            userId,
            requestHash: canonical.requestHash,
            verificationStep: step,
          });
          if (!authorization) {
            throw new AuthorizationDependencyError("authorization_store_unavailable");
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

          const receipt: AuthorizationReceipt = {
            outcome: "issued",
            authorizationId: authorization.id,
            expiresAt: authorization.expiresAt.toISOString(),
            withdrawalRequestHash: canonical.requestHash,
          };
          await completeApiCommandTx(db, receiptScope, {
            httpStatus: 200,
            response: receipt,
          });
          return { receipt, replayed: false };
        });
        if (!issued.enabled) return apiError("db_unavailable", 503);

        if (
          issued.value.receipt.withdrawalRequestHash === "idempotency_conflict"
        ) {
          return apiError("idempotency_key_conflict", 409);
        }
        if (issued.value.receipt.outcome === "2fa_required") {
          return apiError("2fa_required", 403);
        }
        if (issued.value.receipt.outcome === "invalid_totp") {
          if (!issued.value.replayed) {
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
          }
          return apiError("invalid_totp_code", 401, {
            replayed: issued.value.replayed,
          });
        }

        if (!issued.value.replayed) {
          writeAudit({
            actorId: userId,
            action: "wallet_withdrawal",
            ip: getClientIp(req),
            userAgent: (req.headers.get("user-agent") ?? "").slice(0, 500),
            metadata: {
              event: "withdrawal_authorized",
              authorizationId: issued.value.receipt.authorizationId,
              requestHash: canonical.requestHash,
              policyVersion: WITHDRAWAL_ADMISSION_POLICY_VERSION,
              expiresAt: issued.value.receipt.expiresAt,
            },
          });
        }
        return apiOk({
          authorizationId: issued.value.receipt.authorizationId,
          requestHash: canonical.requestHash,
          expiresAt: issued.value.receipt.expiresAt,
          replayed: issued.value.replayed,
        });
      } catch (error) {
        if (error instanceof AuthorizationDependencyError) {
          const code = error.reason === "idempotency_in_progress" ? 409 :
            error.reason === "2fa_secret_corrupt" ? 500 : 503;
          return apiError(error.reason, code);
        }
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
