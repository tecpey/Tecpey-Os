import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveAuditOutcome,
  type SensitiveMutationAuditAction,
  type SensitiveMutationAuditResource,
} from "@/lib/security/sensitive-mutation-audit";

export type ExchangeOrderEvidenceAction = Extract<
  SensitiveMutationAuditAction,
  | "exchange.order.admit"
  | "exchange.order.accept"
  | "exchange.order.reject"
  | "exchange.order.cancel"
  | "exchange.order.fill"
  | "exchange.order.settle"
>;

export type ExchangeOrderEvidenceResource = Extract<
  SensitiveMutationAuditResource,
  "exchange_order" | "order_cancel" | "order_settlement"
>;

function fingerprint(domain: string, value: string): string {
  return createHash("sha256")
    .update(`tecpey-${domain}-v1\0`)
    .update(value)
    .digest("hex");
}

export function fingerprintExchangeOrder(orderId: string): string {
  return fingerprint("exchange-order", orderId);
}

export function fingerprintExchangeTrade(tradeId: string): string {
  return fingerprint("exchange-trade", tradeId);
}

export function fingerprintExchangeCommand(value: string): string {
  return fingerprint("exchange-command", value);
}

function correlation(action: ExchangeOrderEvidenceAction, identity: string): string {
  return `exchange-${action.slice("exchange.order.".length)}:${fingerprint("exchange-evidence", identity)}`;
}

export async function writeExchangeOrderEvidenceTx(
  client: PoolClient,
  input: {
    action: ExchangeOrderEvidenceAction;
    resourceType: ExchangeOrderEvidenceResource;
    resourceIdentity: string;
    correlationIdentity: string;
    requestHash: string;
    actorType: "user" | "admin" | "service";
    actorId: string;
    outcome: SensitiveAuditOutcome;
    metadata?: Record<string, unknown>;
    tenantId: string;
  },
): Promise<string> {
  return writeSensitiveMutationAuditTx(client, {
    tenantId: input.tenantId,
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId:
      input.resourceType === "order_settlement"
        ? fingerprintExchangeTrade(input.resourceIdentity)
        : fingerprintExchangeOrder(input.resourceIdentity),
    outcome: input.outcome,
    correlationId: correlation(input.action, input.correlationIdentity),
    requestHash: input.requestHash,
    metadata: {
      policyVersion: "exchange-order-evidence-v1",
      ...(input.metadata ?? {}),
    },
  });
}
