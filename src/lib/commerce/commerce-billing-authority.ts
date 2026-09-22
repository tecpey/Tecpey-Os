import type { PoolClient } from "pg";
import { commercialEntitlementActive, type CommercialSubscriptionState } from "./commerce-authority";

export type CommerceBillingAuthority = Readonly<{
  subscription: null | {
    id: string; planKey: string; planVersion: number; state: CommercialSubscriptionState;
    effectiveAt: Date; currentPeriodEnd: Date | null; cancelAt: Date | null; stateVersion: number;
  };
  entitlement: { active: boolean; capabilities: Readonly<Record<string, unknown>>; snapshotVersion: number | null };
}>;

type SubscriptionRow = {
  id: string; plan_key: string; plan_version: number; state: CommercialSubscriptionState;
  effective_at: Date; current_period_end: Date | null; cancel_at: Date | null; state_version: string | number;
};
type SnapshotRow = {
  snapshot_version: string | number; capabilities: Record<string, unknown>; valid_from: Date; valid_until: Date | null;
};

const LIVE_SUBSCRIPTION_STATES: readonly CommercialSubscriptionState[] = [
  "pending", "trialing", "active", "grace", "suspended",
];

const inactiveEntitlement = (snapshotVersion: number | null = null) => ({
  active: false as const,
  capabilities: {},
  snapshotVersion,
});

export async function readCommerceBillingAuthority(
  client: PoolClient,
  scope: { tenantId: string; workspaceId: string; accountId: string },
  now = new Date(),
): Promise<CommerceBillingAuthority> {
  if (!scope.tenantId || !scope.workspaceId || !scope.accountId || !Number.isFinite(now.getTime())) {
    throw new Error("invalid_commerce_billing_scope");
  }

  // Historical canceled/expired subscriptions are legitimate ledger history and
  // must not make a current subscription unreadable. Only simultaneous live
  // candidates are ambiguous. We deliberately fetch at most two to prove
  // uniqueness without trusting client-side ordering or provider redirects.
  const live = await client.query<SubscriptionRow>(
    `SELECT id,plan_key,plan_version,state,effective_at,current_period_end,cancel_at,state_version
       FROM commerce_subscriptions
      WHERE tenant_id=$1 AND workspace_id=$2 AND account_id=$3
        AND state = ANY($4::text[])
      ORDER BY effective_at DESC, created_at DESC, id DESC
      LIMIT 2`,
    [scope.tenantId, scope.workspaceId, scope.accountId, LIVE_SUBSCRIPTION_STATES],
  );
  if (live.rows.length > 1) {
    return { subscription: null, entitlement: inactiveEntitlement() };
  }

  let row = live.rows[0];
  if (!row) {
    const terminal = await client.query<SubscriptionRow>(
      `SELECT id,plan_key,plan_version,state,effective_at,current_period_end,cancel_at,state_version
         FROM commerce_subscriptions
        WHERE tenant_id=$1 AND workspace_id=$2 AND account_id=$3
          AND state IN ('canceled','expired')
        ORDER BY effective_at DESC, created_at DESC, id DESC
        LIMIT 1`,
      [scope.tenantId, scope.workspaceId, scope.accountId],
    );
    row = terminal.rows[0];
  }
  if (!row) {
    return { subscription: null, entitlement: inactiveEntitlement() };
  }

  const stateVersion = Number(row.state_version);
  if (!Number.isSafeInteger(stateVersion) || stateVersion < 1) {
    return { subscription: null, entitlement: inactiveEntitlement() };
  }
  const subscription = {
    id: row.id, planKey: row.plan_key, planVersion: row.plan_version, state: row.state,
    effectiveAt: row.effective_at, currentPeriodEnd: row.current_period_end, cancelAt: row.cancel_at, stateVersion,
  };
  const stateAllowsEntitlement = commercialEntitlementActive({
    state: row.state, now, effectiveAt: row.effective_at, currentPeriodEnd: row.current_period_end,
  });
  if (!stateAllowsEntitlement) {
    return { subscription, entitlement: inactiveEntitlement() };
  }

  const snapshots = await client.query<SnapshotRow>(
    `SELECT snapshot_version,capabilities,valid_from,valid_until
       FROM commerce_entitlement_snapshots
      WHERE tenant_id=$1 AND workspace_id=$2 AND account_id=$3 AND subscription_id=$4
      ORDER BY snapshot_version DESC, created_at DESC, id DESC LIMIT 1`,
    [scope.tenantId, scope.workspaceId, scope.accountId, row.id],
  );
  const snapshot = snapshots.rows[0];
  if (!snapshot) {
    return { subscription, entitlement: inactiveEntitlement() };
  }
  const snapshotVersion = Number(snapshot.snapshot_version);
  const currentSnapshot =
    Number.isSafeInteger(snapshotVersion) &&
    snapshotVersion === stateVersion &&
    snapshot.valid_from.getTime() <= now.getTime() &&
    (snapshot.valid_until === null || snapshot.valid_until.getTime() > now.getTime());
  if (!currentSnapshot) {
    return { subscription, entitlement: inactiveEntitlement(snapshotVersion) };
  }
  return { subscription, entitlement: { active: true, capabilities: snapshot.capabilities, snapshotVersion } };
}
