import { NextRequest } from "next/server";
import { withTx } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api-validation";
import { getExchangeSession } from "@/lib/security/exchange-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import {
  claimApiCommandTx,
  completeApiCommandTx,
  hashApiCommand,
  parseApiIdempotencyKey,
  type ApiCommandScope,
} from "@/lib/security/api-command-idempotency";
import { decryptTotpSecret, verifyTotpStep } from "@/lib/security/totp";
import {
  canonicalizeWithdrawalCommand,
  issueWithdrawalAuthorizationTx,
  WITHDRAWAL_ADMISSION_POLICY_VERSION,
  WITHDRAWAL_AUTHORIZATION_TTL_SECONDS,
} from "@/lib/security/withdrawal-admission-authority";
import {
  fingerprintWithdrawalDestination,
  fingerprintWithdrawalRequest,
  writeWithdrawalEvidenceTx,
} from "@/lib/security/withdrawal-evidence";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

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
      if (!await verifyCsrfOrigin(req)) return apiError("forbidden", 403);

      const session = await getExchangeSession(req);
      if (!session) return apiError("exchange_authentication_required", 401);
      const userId = session.productAccountId;
      const tenantId = session.tenantId;

      const limited = await rateLimit(req, {
        namespace: "withdraw-authorize",
        identity: `${tenantId}:${userId}`,
        limit: 5,
        windowMs: 5 * 60_000,
      });
      if (!limited.ok) return apiError("rate_limited", 429);

      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 16_384,
        allowEmptyObject: true,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      req = boundedBodyRequest.request;
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
        tenantId,
        principalType: "user",
        principalId: userId,
        operation: "withdrawal.authorize",
        idempotencyKey,
        requestHash: hashApiCommand({
          withdrawalRequestHash: canonical.requestHash,
          totpCodeHash: hashApiCommand(code),
        }),
      };
      const requestFingerprint = fingerprintWithdrawalRequest(canonical.requestHash);
      const destinationFingerprint = fingerprintWithdrawalDestination({
        network: canonical.command.network,
        destinationAddress: canonical.command.destinationAddress,
        destinationTag: canonical.command.destinationTag,
      });
      const evidenceMetadata = {
        admissionPolicyVersion: WITHDRAWAL_ADMISSION_POLICY_VERSION,
        requestFingerprint,
        destinationFingerprint,
        asset: canonical.command.asset,
        network: canonical.command.network,
        amount: canonical.command.amount,
      };

      try {
        const issued = await withTx<AuthorizationTransactionResult>(async (db) => {
          const principal = await db.query<{ account_id: string | null }>(
            `SELECT account_id
               FROM platform_principals
              WHERE tenant_id = $1
                AND id = $2::uuid
                AND status = 'active'
              FOR SHARE`,
            [tenantId, session.principalId],
          );
          const factorUserId = principal.rows[0]?.account_id ?? null;
          if (!factorUserId) {
            throw new AuthorizationDependencyError("identity_factor_unavailable");
          }

          const claim = await claimApiCommandTx<AuthorizationReceipt>(db, receiptScope);
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
          if (claim.status === "replayed") return { receipt: claim.response, replayed: true };

          const factor = await db.query<{ encrypted_secret: string }>(
            `SELECT encrypted_secret
               FROM user_2fa
              WHERE user_id = $1
                AND enabled = TRUE
              FOR UPDATE`,
            [factorUserId],
          );
          const row = factor.rows[0];
          if (!row) {
            const receipt: AuthorizationReceipt = {
              outcome: "2fa_required",
              withdrawalRequestHash: canonical.requestHash,
            };
            await writeWithdrawalEvidenceTx(db, {
              tenantId,
              actorType: "user",
              actorId: userId,
              action: "withdrawal.authorization.reject",
              resourceType: "withdrawal_authorization",
              resourceIdentity: canonical.requestHash,
              correlationIdentity: `${receiptScope.requestHash}:2fa_required`,
              requestHash: receiptScope.requestHash,
              outcome: "rejected",
              metadata: {
                ...evidenceMetadata,
                reason: "2fa_required",
                factorPresent: false,
              },
            });
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
            await writeWithdrawalEvidenceTx(db, {
              tenantId,
              actorType: "user",
              actorId: userId,
              action: "withdrawal.authorization.reject",
              resourceType: "withdrawal_authorization",
              resourceIdentity: canonical.requestHash,
              correlationIdentity: `${receiptScope.requestHash}:invalid_totp`,
              requestHash: receiptScope.requestHash,
              outcome: "rejected",
              metadata: {
                ...evidenceMetadata,
                reason: "invalid_totp",
                factorPresent: true,
              },
            });
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
            [factorUserId],
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
          await writeWithdrawalEvidenceTx(db, {
            tenantId,
            actorType: "user",
            actorId: userId,
            action: "withdrawal.authorization.issue",
            resourceType: "withdrawal_authorization",
            resourceIdentity: authorization.id,
            correlationIdentity: `${receiptScope.requestHash}:issued`,
            requestHash: receiptScope.requestHash,
            outcome: "success",
            metadata: {
              ...evidenceMetadata,
              factorPresent: true,
              identityFactorSubject: "canonical_principal_account",
              authorizationLifetimeSeconds: WITHDRAWAL_AUTHORIZATION_TTL_SECONDS,
            },
          });
          await completeApiCommandTx(db, receiptScope, {
            httpStatus: 200,
            response: receipt,
          });
          return { receipt, replayed: false };
        });
        if (!issued.enabled) return apiError("db_unavailable", 503);

        if (issued.value.receipt.withdrawalRequestHash === "idempotency_conflict") {
          return apiError("idempotency_key_conflict", 409);
        }
        if (issued.value.receipt.outcome === "2fa_required") return apiError("2fa_required", 403);
        if (issued.value.receipt.outcome === "invalid_totp") {
          return apiError("invalid_totp_code", 401, { replayed: issued.value.replayed });
        }
        return apiOk({
          authorizationId: issued.value.receipt.authorizationId,
          requestHash: canonical.requestHash,
          expiresAt: issued.value.receipt.expiresAt,
          replayed: issued.value.replayed,
        });
      } catch (error) {
        if (error instanceof AuthorizationDependencyError) {
          const status = error.reason === "idempotency_in_progress" ? 409
            : error.reason === "2fa_secret_corrupt" ? 500
            : error.reason === "identity_factor_unavailable" ? 403
            : 503;
          return apiError(error.reason, status);
        }
        const codeValue =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code?: unknown }).code ?? "")
            : "";
        if (codeValue === "23505") return apiError("totp_code_already_used", 409);
        return apiError("authorization_store_unavailable", 503);
      }
    },
  );
}