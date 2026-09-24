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

export async function readCommerceBillingAuthority(
  client: PoolClient,
  scope: { tenantId: string; workspaceId: string; accountId: string },
  now = new Date(),
): Promise<CommerceBillingAuthority> {
  if (!scope.tenantId || !scope.workspaceId || !scope.accountId || !Number.isFinite(now.getTime())) {
    throw new Error("invalid_commerce_billing_scope");
  }
  const subscriptions = await client.query<SubscriptionRow>(
    `SELECT id,plan_key,plan_version,state,effective_at,current_period_end,cancel_at,state_version
       FROM commerce_subscriptions
      WHERE tenant_id=$1 AND workspace_id=$2 AND account_id=$3
      ORDER BY effective_at DESC, created_at DESC, id DESC LIMIT 2`,
    [scope.tenantId, scope.workspaceId, scope.accountId],
  );
  if (subscriptions.rows.length === 0) {
    return { subscription: null, entitlement: { active: false, capabilities: {}, snapshotVersion: null } };
  }
  if (subscriptions.rows.length !== 1) {
    return { subscription: null, entitlement: { active: false, capabilities: {}, snapshotVersion: null } };
  }
  const row = subscriptions.rows[0];
  const stateVersion = Number(row.state_version);
  if (!Number.isSafeInteger(stateVersion) || stateVersion < 1) {
    return { subscription: null, entitlement: { active: false, capabilities: {}, snapshotVersion: null } };
  }
  const subscription = {
    id: row.id, planKey: row.plan_key, planVersion: row.plan_version, state: row.state,
    effectiveAt: row.effective_at, currentPeriodEnd: row.current_period_end, cancelAt: row.cancel_at, stateVersion,
  };
  const stateAllowsEntitlement = commercialEntitlementActive({
    state: row.state, now, effectiveAt: row.effective_at, currentPeriodEnd: row.current_period_end,
  });
  if (!stateAllowsEntitlement) {
    return { subscription, entitlement: { active: false, capabilities: {}, snapshotVersion: null } };
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
    return { subscription, entitlement: { active: false, capabilities: {}, snapshotVersion: null } };
  }
  const snapshotVersion = Number(snapshot.snapshot_version);
  const currentSnapshot =
    Number.isSafeInteger(snapshotVersion) &&
    snapshotVersion === stateVersion &&
    snapshot.valid_from.getTime() <= now.getTime() &&
    (snapshot.valid_until === null || snapshot.valid_until.getTime() > now.getTime());
  if (!currentSnapshot) {
    return { subscription, entitlement: { active: false, capabilities: {}, snapshotVersion } };
  }
  return { subscription, entitlement: { active: true, capabilities: snapshot.capabilities, snapshotVersion } };
}
