import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveAuditOutcome,
  type SensitiveMutationAuditAction,
  type SensitiveMutationAuditResource,
} from "./sensitive-mutation-audit";

export const RISK_ENFORCEMENT_POLICY_VERSION = "risk-enforcement-authority-v1";

export type RiskEventType =
  | "order_frequency_high"
  | "order_burst"
  | "ip_switch_detected"
  | "duplicate_request"
  | "suspicious_api_behavior";

export type RiskSeverity = "low" | "medium" | "high";

export type RiskLevel =
  | "review"
  | "trade_blocked"
  | "withdraw_blocked"
  | "all_blocked";

export type EffectiveRiskLevel = RiskLevel | "none";

export type RiskEvidenceAction =
  | "risk.event.record"
  | "risk.enforcement.apply"
  | "risk.enforcement.clear"
  | "risk.enforcement.expire";

export type RiskEvidenceResource = "risk_event" | "risk_enforcement";

function fingerprint(domain: string, value: string): string {
  return createHash("sha256")
    .update(`tecpey:${domain}:v1\u001f`)
    .update(value)
    .digest("hex");
}

export function fingerprintRiskPrincipal(principalId: string): string {
  return fingerprint("risk-principal", principalId);
}

export function fingerprintRiskEventIdentity(identity: string): string {
  return fingerprint("risk-event", identity);
}

export function fingerprintRiskDetectorValue(value: string): string {
  return fingerprint("risk-detector-value", value);
}

export function fingerprintRiskResource(
  resourceType: RiskEvidenceResource,
  identity: string,
): string {
  return fingerprint(resourceType.replaceAll("_", "-"), identity);
}

function evidenceCorrelation(action: RiskEvidenceAction, identity: string): string {
  const suffix = action.replaceAll(".", "-");
  return `risk-${suffix}:${fingerprint(`risk-${suffix}`, identity)}`;
}

export async function writeRiskEvidenceTx(
  client: PoolClient,
  input: {
    tenantId: string;
    actorId: "risk-engine" | "risk-authority" | "risk-admin";
    action: RiskEvidenceAction;
    resourceType: RiskEvidenceResource;
    resourceIdentity: string;
    correlationIdentity: string;
    requestHash: string;
    outcome: SensitiveAuditOutcome;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  return writeSensitiveMutationAuditTx(client, {
    tenantId: input.tenantId,
    actorType: input.actorId === "risk-admin" ? "admin" : "service",
    actorId: input.actorId,
    // Domain-local unions remain explicit until the central audit union is
    // extended in the same PR. The runtime authority validates token shape and
    // the permanent source guard requires these exact values.
    action: input.action as SensitiveMutationAuditAction,
    resourceType: input.resourceType as SensitiveMutationAuditResource,
    resourceId: fingerprintRiskResource(
      input.resourceType,
      input.resourceIdentity,
    ),
    outcome: input.outcome,
    correlationId: evidenceCorrelation(input.action, input.correlationIdentity),
    requestHash: input.requestHash,
    metadata: {
      policyVersion: RISK_ENFORCEMENT_POLICY_VERSION,
      ...(input.metadata ?? {}),
    },
  });
}
