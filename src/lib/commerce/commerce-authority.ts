export const COMMERCIAL_SUBSCRIPTION_STATES = [
  "pending", "trialing", "active", "grace", "suspended", "canceled", "expired",
] as const;
export type CommercialSubscriptionState = typeof COMMERCIAL_SUBSCRIPTION_STATES[number];

export type CommercialEvent = Readonly<{
  provider: string;
  providerAccountScope: string;
  providerEventId: string;
  providerObjectId: string;
  occurredAt: Date;
  normalizedState: CommercialSubscriptionState | "unknown";
  currentPeriodEnd?: Date | null;
  cancelAt?: Date | null;
}>;

export type CommercialProjection = Readonly<{
  state: CommercialSubscriptionState;
  effectiveAt: Date;
  lastProviderEventAt: Date | null;
  stateVersion: number;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
}>;

const allowed: Readonly<Record<CommercialSubscriptionState, readonly CommercialSubscriptionState[]>> = {
  pending: ["trialing", "active", "suspended", "canceled", "expired"],
  trialing: ["active", "grace", "suspended", "canceled", "expired"],
  active: ["grace", "suspended", "canceled", "expired"],
  grace: ["active", "suspended", "canceled", "expired"],
  suspended: ["active", "grace", "canceled", "expired"],
  canceled: ["active", "expired"],
  expired: [],
};

export type ReconcileResult =
  | { ok: true; projection: CommercialProjection; reason: "applied" }
  | { ok: true; projection: CommercialProjection; reason: "duplicate_or_stale" }
  | { ok: false; projection: CommercialProjection; reason: "unknown_provider_state" | "invalid_transition" };

export function reconcileCommercialEvent(
  current: CommercialProjection,
  event: CommercialEvent,
): ReconcileResult {
  if (event.normalizedState === "unknown") {
    return { ok: false, projection: current, reason: "unknown_provider_state" };
  }
  if (current.lastProviderEventAt && event.occurredAt.getTime() <= current.lastProviderEventAt.getTime()) {
    return { ok: true, projection: current, reason: "duplicate_or_stale" };
  }
  if (event.normalizedState !== current.state && !allowed[current.state].includes(event.normalizedState)) {
    return { ok: false, projection: current, reason: "invalid_transition" };
  }
  return {
    ok: true,
    reason: "applied",
    projection: {
      state: event.normalizedState,
      effectiveAt: event.occurredAt,
      lastProviderEventAt: event.occurredAt,
      stateVersion: current.stateVersion + 1,
      currentPeriodEnd: event.currentPeriodEnd ?? current.currentPeriodEnd,
      cancelAt: event.cancelAt ?? current.cancelAt,
    },
  };
}

export function commercialEntitlementActive(input: {
  state: CommercialSubscriptionState;
  now: Date;
  effectiveAt: Date;
  currentPeriodEnd: Date | null;
}): boolean {
  if (input.effectiveAt.getTime() > input.now.getTime()) return false;
  if (!["trialing", "active", "grace"].includes(input.state)) return false;
  return input.currentPeriodEnd === null || input.currentPeriodEnd.getTime() > input.now.getTime();
}

export interface CommerceProviderAdapter {
  readonly provider: string;
  createCheckout(input: {
    tenantId: string; workspaceId: string; accountId: string; planKey: string;
    planVersion: number; idempotencyKey: string;
  }): Promise<{ providerObjectId: string; redirectUrl: string }>;
  cancel(input: { providerSubscriptionId: string; idempotencyKey: string }): Promise<void>;
  refund(input: { providerPaymentId: string; amountMinor: bigint; currency: string; idempotencyKey: string }): Promise<void>;
  verifyAndNormalizeWebhook(input: { body: Uint8Array; headers: Readonly<Record<string, string>> }): Promise<CommercialEvent>;
}
