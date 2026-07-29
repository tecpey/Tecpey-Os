import { logger } from "@/lib/logger";
import { getComplianceProviders } from "./compliance";

export const WITHDRAWAL_COMPLIANCE_POLICY_VERSION = "withdrawal-compliance-v1";

export type WithdrawalComplianceDecision = {
  state: "approved" | "compliance_review" | "blocked";
  kycStatus: string;
  amlRisk: string;
  sanctionsHit: boolean;
  evidence: Record<string, unknown>;
  reason: string;
};

export async function getStrictWithdrawalRiskLevel(
  userId: string,
): Promise<
  | { ok: true; level: "withdraw_blocked" | "all_blocked" | "review" | null }
  | { ok: false; reason: "risk_authority_unavailable" }
> {
  const redis = globalThis.tecpeyRedisClient;
  if (!redis) return { ok: false, reason: "risk_authority_unavailable" };
  try {
    const value = await redis.get(`tecpey:risk:level:${userId}`);
    if (value === "withdraw_blocked" || value === "all_blocked" || value === "review") {
      return { ok: true, level: value };
    }
    return { ok: true, level: null };
  } catch (error) {
    logger.warn("[withdrawal-admission] risk authority unavailable", {
      userId,
      error: String(error),
    });
    return { ok: false, reason: "risk_authority_unavailable" };
  }
}

type ControlResult<T> =
  | { status: "ok"; value: T }
  | { status: "unavailable" | "timeout" | "malformed"; error?: string };

async function runControl<T>(
  operation: (() => Promise<T>) | null,
  validate: (value: T) => boolean,
): Promise<ControlResult<T>> {
  if (!operation) return { status: "unavailable" };
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("control_timeout")), 5_000);
    });
    const value = await Promise.race([operation(), timeout]);
    if (!validate(value)) return { status: "malformed" };
    return { status: "ok", value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: message === "control_timeout" ? "timeout" : "unavailable",
      error: message,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function evaluateWithdrawalCompliance(input: {
  withdrawalId: string;
  userId: string;
  asset: string;
  amount: string;
  destinationAddress: string;
}): Promise<WithdrawalComplianceDecision> {
  const providers = getComplianceProviders();
  const [kyc, aml, sanctions] = await Promise.all([
    runControl(
      providers.kyc ? () => providers.kyc!.getStatus(input.userId) : null,
      (value) =>
        Boolean(value) &&
        ["not_started", "pending", "approved", "rejected", "expired"].includes(
          (value as { status?: string }).status ?? "",
        ),
    ),
    runControl(
      providers.aml
        ? () =>
            providers.aml!.screenTransaction({
              userId: input.userId,
              txId: input.withdrawalId,
              asset: input.asset,
              amount: input.amount,
              direction: "withdrawal",
              counterpartyAddress: input.destinationAddress,
            })
        : null,
      (value) =>
        Boolean(value) &&
        ["low", "medium", "high", "blocked"].includes(
          (value as { riskScore?: string }).riskScore ?? "",
        ) &&
        Array.isArray((value as { flags?: unknown }).flags) &&
        typeof (value as { requiresReview?: unknown }).requiresReview === "boolean",
    ),
    runControl(
      providers.sanctions
        ? () => providers.sanctions!.screenAddress(input.destinationAddress, input.asset)
        : null,
      (value) =>
        Boolean(value) &&
        typeof (value as { matched?: unknown }).matched === "boolean" &&
        (value as { confidence?: unknown }).confidence !== undefined,
    ),
  ]);

  const kycStatus = kyc.status === "ok" ? kyc.value.status : kyc.status;
  const amlRisk = aml.status === "ok" ? aml.value.riskScore : aml.status;
  const sanctionsHit = sanctions.status === "ok" ? sanctions.value.matched : false;
  const evidence: Record<string, unknown> = {
    policyVersion: WITHDRAWAL_COMPLIANCE_POLICY_VERSION,
    checkedAt: new Date().toISOString(),
    kyc:
      kyc.status === "ok"
        ? { status: kyc.value.status, level: kyc.value.level }
        : { status: kyc.status, error: kyc.error ?? null },
    aml:
      aml.status === "ok"
        ? {
            status: "ok",
            riskScore: aml.value.riskScore,
            flags: aml.value.flags,
            requiresReview: aml.value.requiresReview,
          }
        : { status: aml.status, error: aml.error ?? null },
    sanctions:
      sanctions.status === "ok"
        ? {
            status: "ok",
            matched: sanctions.value.matched,
            listName: sanctions.value.listName,
            confidence: sanctions.value.confidence,
          }
        : { status: sanctions.status, error: sanctions.error ?? null },
  };

  if (
    sanctionsHit ||
    amlRisk === "blocked" ||
    amlRisk === "high" ||
    kycStatus === "rejected"
  ) {
    return {
      state: "blocked",
      kycStatus,
      amlRisk,
      sanctionsHit,
      evidence,
      reason: sanctionsHit ? "sanctions_match" : "compliance_blocked",
    };
  }

  const allControlsPass =
    kyc.status === "ok" &&
    kyc.value.status === "approved" &&
    aml.status === "ok" &&
    aml.value.riskScore === "low" &&
    !aml.value.requiresReview &&
    sanctions.status === "ok" &&
    !sanctions.value.matched;

  if (!allControlsPass) {
    return {
      state: "compliance_review",
      kycStatus,
      amlRisk,
      sanctionsHit,
      evidence,
      reason: "compliance_evidence_incomplete",
    };
  }

  if (process.env.TECPEY_REAL_WITHDRAWALS_ENABLED !== "1") {
    return {
      state: "compliance_review",
      kycStatus,
      amlRisk,
      sanctionsHit,
      evidence: { ...evidence, custodyLaunchGate: "disabled" },
      reason: "custody_launch_gate_disabled",
    };
  }

  return {
    state: "approved",
    kycStatus,
    amlRisk,
    sanctionsHit,
    evidence: { ...evidence, custodyLaunchGate: "enabled" },
    reason: "all_controls_passed",
  };
}
