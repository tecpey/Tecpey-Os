import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  commercialEntitlementActive,
  reconcileCommercialEvent,
  type CommerceProviderAdapter,
  type CommercialEvent,
  type CommercialProjection,
  type CommercialSubscriptionState,
} from "./commerce-authority";

export const MAX_COMMERCE_WEBHOOK_BYTES = 256 * 1024;

export class CommerceWebhookAuthorityError extends Error {
  constructor(
    public readonly code:
      | "body_too_large"
      | "invalid_verified_event"
      | "provider_mismatch"
      | "event_identity_conflict"
      | "subscription_projection_conflict",
  ) {
    super(code);
    this.name = "CommerceWebhookAuthorityError";
  }
}

export type VerifiedCommercialWebhook = Readonly<{
  event: CommercialEvent;
  eventType: string;
  payloadSha256: string;
  payloadRedacted: Readonly<Record<string, unknown>>;
  payloadExpiresAt: Date;
}>;

function boundedText(value: string, max: number): boolean {
  return value.length > 0 && value.length <= max;
}

function validDate(value: Date | null | undefined): boolean {
  return value == null || Number.isFinite(value.getTime());
}

export async function verifyCommercialWebhookEnvelope(input: {
  adapter: CommerceProviderAdapter;
  body: Uint8Array;
  headers: Readonly<Record<string, string>>;
  eventType: string;
  payloadRedacted?: Readonly<Record<string, unknown>>;
  payloadRetentionMs?: number;
  now?: Date;
}): Promise<VerifiedCommercialWebhook> {
  if (input.body.byteLength === 0 || input.body.byteLength > MAX_COMMERCE_WEBHOOK_BYTES) {
    throw new CommerceWebhookAuthorityError("body_too_large");
  }
  const event = await input.adapter.verifyAndNormalizeWebhook({ body: input.body, headers: input.headers });
  if (event.provider !== input.adapter.provider) throw new CommerceWebhookAuthorityError("provider_mismatch");
  if (
    !boundedText(event.provider, 40) ||
    !boundedText(event.providerAccountScope, 160) ||
    !boundedText(event.providerEventId, 255) ||
    !boundedText(event.providerObjectId, 255) ||
    !boundedText(input.eventType, 120) ||
    !validDate(event.occurredAt) ||
    !validDate(event.currentPeriodEnd) ||
    !validDate(event.cancelAt)
  ) {
    throw new CommerceWebhookAuthorityError("invalid_verified_event");
  }
  const payloadRedacted = input.payloadRedacted ?? {};
  const encodedRedacted = JSON.stringify(payloadRedacted);
  if (Buffer.byteLength(encodedRedacted, "utf8") > 32_768) {
    throw new CommerceWebhookAuthorityError("invalid_verified_event");
  }
  const now = input.now ?? new Date();
  const retention = input.payloadRetentionMs ?? 7 * 24 * 60 * 60 * 1000;
  if (!Number.isSafeInteger(retention) || retention <= 0) {
    throw new CommerceWebhookAuthorityError("invalid_verified_event");
  }
  return {
    event,
    eventType: input.eventType,
    payloadSha256: createHash("sha256").update(input.body).digest("hex"),
    payloadRedacted,
    payloadExpiresAt: new Date(now.getTime() + retention),
  };
}

type SubscriptionRow = {
  id: string;
  account_id: string;
  state: CommercialSubscriptionState;
  effective_at: Date;
  current_period_end: Date | null;
  cancel_at: Date | null;
  last_provider_event_at: Date | null;
  state_version: string | number;
  plan_key: string;
  plan_version: number;
};

export type CommerceWebhookIngestResult =
  | { outcome: "duplicate"; providerEventId: string }
  | { outcome: "needs_reconciliation"; providerEventId: string; reason: "subscription_not_found" }
  | { outcome: "superseded" | "rejected" | "applied"; providerEventId: string; subscriptionId: string; stateVersion: number };

function projection(row: SubscriptionRow): CommercialProjection {
  return {
    state: row.state,
    effectiveAt: row.effective_at,
    lastProviderEventAt: row.last_provider_event_at,
    stateVersion: Number(row.state_version),
    currentPeriodEnd: row.current_period_end,
    cancelAt: row.cancel_at,
  };
}

export async function ingestVerifiedCommercialWebhook(
  client: PoolClient,
  scope: { tenantId: string; workspaceId: string },
  verified: VerifiedCommercialWebhook,
): Promise<CommerceWebhookIngestResult> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.tenant_id', $1, true), set_config('app.workspace_id', $2, true)", [
      scope.tenantId,
      scope.workspaceId,
    ]);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO commerce_provider_events
        (tenant_id, workspace_id, provider, provider_account_scope, provider_event_id, event_type,
         provider_object_id, occurred_at, signature_verified, payload_sha256, payload_redacted, payload_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,$10::jsonb,$11)
       ON CONFLICT (tenant_id, workspace_id, provider, provider_account_scope, provider_event_id) DO NOTHING
       RETURNING id`,
      [
        scope.tenantId, scope.workspaceId, verified.event.provider, verified.event.providerAccountScope,
        verified.event.providerEventId, verified.eventType, verified.event.providerObjectId,
        verified.event.occurredAt, verified.payloadSha256, JSON.stringify(verified.payloadRedacted),
        verified.payloadExpiresAt,
      ],
    );

    if (!inserted.rows[0]) {
      const existing = await client.query<{ payload_sha256: string; provider_object_id: string | null }>(
        `SELECT payload_sha256, provider_object_id
           FROM commerce_provider_events
          WHERE tenant_id=$1 AND workspace_id=$2 AND provider=$3
            AND provider_account_scope=$4 AND provider_event_id=$5`,
        [scope.tenantId, scope.workspaceId, verified.event.provider, verified.event.providerAccountScope, verified.event.providerEventId],
      );
      const row = existing.rows[0];
      if (!row || row.payload_sha256 !== verified.payloadSha256 || row.provider_object_id !== verified.event.providerObjectId) {
        throw new CommerceWebhookAuthorityError("event_identity_conflict");
      }
      await client.query("COMMIT");
      return { outcome: "duplicate", providerEventId: verified.event.providerEventId };
    }

    const providerEventPk = inserted.rows[0].id;
    const subscriptions = await client.query<SubscriptionRow>(
      `SELECT id, account_id, state, effective_at, current_period_end, cancel_at,
              last_provider_event_at, state_version, plan_key, plan_version
         FROM commerce_subscriptions
        WHERE tenant_id=$1 AND workspace_id=$2 AND provider=$3
          AND provider_account_scope=$4 AND provider_subscription_id=$5
        FOR UPDATE`,
      [scope.tenantId, scope.workspaceId, verified.event.provider, verified.event.providerAccountScope, verified.event.providerObjectId],
    );
    const subscription = subscriptions.rows[0];
    if (!subscription) {
      await client.query(
        `INSERT INTO commerce_reconciliation_records
          (tenant_id, workspace_id, provider_event_id, decision, reason_code)
         VALUES ($1,$2,$3,'needs_reconciliation','subscription_not_found')`,
        [scope.tenantId, scope.workspaceId, providerEventPk],
      );
      await client.query("COMMIT");
      return { outcome: "needs_reconciliation", providerEventId: verified.event.providerEventId, reason: "subscription_not_found" };
    }

    const before = projection(subscription);
    const reconciled = reconcileCommercialEvent(before, verified.event);
    const decision = reconciled.ok
      ? (reconciled.reason === "applied" ? "applied" : "superseded")
      : "rejected";
    const reasonCode = reconciled.reason;
    let afterVersion = before.stateVersion;

    if (reconciled.ok && reconciled.reason === "applied") {
      const next = reconciled.projection;
      const updated = await client.query(
        `UPDATE commerce_subscriptions
            SET state=$1, effective_at=$2, current_period_end=$3, cancel_at=$4,
                last_provider_event_at=$5, state_version=$6, updated_at=NOW()
          WHERE id=$7 AND tenant_id=$8 AND workspace_id=$9 AND state_version=$10`,
        [
          next.state, next.effectiveAt, next.currentPeriodEnd, next.cancelAt, next.lastProviderEventAt,
          next.stateVersion, subscription.id, scope.tenantId, scope.workspaceId, before.stateVersion,
        ],
      );
      if (updated.rowCount !== 1) throw new CommerceWebhookAuthorityError("subscription_projection_conflict");
      afterVersion = next.stateVersion;

      const plans = await client.query<{ capability_grants: Record<string, unknown> }>(
        `SELECT capability_grants FROM commerce_plan_versions
          WHERE tenant_id=$1 AND workspace_id=$2 AND plan_key=$3 AND version=$4`,
        [scope.tenantId, scope.workspaceId, subscription.plan_key, subscription.plan_version],
      );
      const active = commercialEntitlementActive({
        state: next.state,
        now: next.effectiveAt,
        effectiveAt: next.effectiveAt,
        currentPeriodEnd: next.currentPeriodEnd,
      });
      const capabilities = active ? (plans.rows[0]?.capability_grants ?? {}) : {};
      await client.query(
        `INSERT INTO commerce_entitlement_snapshots
          (tenant_id, workspace_id, account_id, subscription_id, snapshot_version, source_kind,
           source_event_id, capabilities, valid_from, valid_until)
         VALUES ($1,$2,$3,$4,$5,'commercial_subscription',$6,$7::jsonb,$8,$9)`,
        [
          scope.tenantId, scope.workspaceId, subscription.account_id, subscription.id, next.stateVersion,
          providerEventPk, JSON.stringify(capabilities), next.effectiveAt,
          active ? next.currentPeriodEnd : next.effectiveAt,
        ],
      );
    }

    await client.query(
      `INSERT INTO commerce_reconciliation_records
        (tenant_id, workspace_id, provider_event_id, subscription_id, decision, reason_code,
         before_state_version, after_state_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [scope.tenantId, scope.workspaceId, providerEventPk, subscription.id, decision, reasonCode, before.stateVersion, afterVersion],
    );
    await client.query("COMMIT");
    return {
      outcome: decision,
      providerEventId: verified.event.providerEventId,
      subscriptionId: subscription.id,
      stateVersion: afterVersion,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
