import type { Pool, PoolClient } from "pg";
import type { CommerceProviderAdapter } from "./commerce-authority";
import {
  claimCommerceProviderOperationTx,
  completeCommerceProviderOperationTx,
  hashCommerceProviderOperation,
  markCommerceProviderOperationUnknownTx,
  type CommerceProviderOperationClaim,
} from "./commerce-provider-authority";

export class CommerceProviderDispatchError extends Error {
  constructor(public readonly code: "operation_conflict" | "operation_in_progress" | "provider_outcome_unknown") {
    super(code);
    this.name = "CommerceProviderDispatchError";
  }
}

type Scope = { tenantId: string; workspaceId: string };

async function scopedTx<T>(pool: Pool, scope: Scope, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.tenant_id',$1,true), set_config('app.workspace_id',$2,true)", [
      scope.tenantId, scope.workspaceId,
    ]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function requireDispatch(claim: CommerceProviderOperationClaim): "dispatch" | { providerObjectId: string | null } {
  if (claim.status === "claimed" || claim.status === "retry_same_key") return "dispatch";
  if (claim.status === "replayed") return { providerObjectId: claim.providerObjectId };
  if (claim.status === "in_progress") throw new CommerceProviderDispatchError("operation_in_progress");
  throw new CommerceProviderDispatchError("operation_conflict");
}

async function markUnknown(pool: Pool, scope: Scope, input: {
  provider: string; idempotencyKey: string; requestHash: string;
}): Promise<never> {
  await scopedTx(pool, scope, (client) => markCommerceProviderOperationUnknownTx(client, {
    tenantId: scope.tenantId, workspaceId: scope.workspaceId, ...input,
  }));
  throw new CommerceProviderDispatchError("provider_outcome_unknown");
}

export async function createCommerceCheckout(input: {
  pool: Pool; adapter: CommerceProviderAdapter; scope: Scope; accountId: string; planKey: string;
  planVersion: number; idempotencyKey: string;
}): Promise<{ providerObjectId: string; redirectUrl: string | null; replayed: boolean }> {
  const requestHash = hashCommerceProviderOperation({
    ...input.scope, provider: input.adapter.provider, operationType: "checkout_create",
    accountId: input.accountId, planKey: input.planKey, planVersion: input.planVersion,
  });
  const claim = await scopedTx(input.pool, input.scope, (client) => claimCommerceProviderOperationTx(client, {
    ...input.scope, provider: input.adapter.provider, operationType: "checkout_create",
    idempotencyKey: input.idempotencyKey, requestHash,
  }));
  const action = requireDispatch(claim);
  if (action !== "dispatch") {
    return { providerObjectId: action.providerObjectId ?? "", redirectUrl: null, replayed: true };
  }
  let providerResult: { providerObjectId: string; redirectUrl: string };
  try {
    providerResult = await input.adapter.createCheckout({
      ...input.scope, accountId: input.accountId, planKey: input.planKey, planVersion: input.planVersion,
      idempotencyKey: input.idempotencyKey,
    });
  } catch {
    return markUnknown(input.pool, input.scope, {
      provider: input.adapter.provider, idempotencyKey: input.idempotencyKey, requestHash,
    });
  }
  await scopedTx(input.pool, input.scope, (client) => completeCommerceProviderOperationTx(client, {
    ...input.scope, provider: input.adapter.provider, idempotencyKey: input.idempotencyKey,
    requestHash, providerObjectId: providerResult.providerObjectId,
  }));
  return { ...providerResult, replayed: false };
}

export async function cancelCommerceSubscription(input: {
  pool: Pool; adapter: CommerceProviderAdapter; scope: Scope; providerSubscriptionId: string; idempotencyKey: string;
}): Promise<{ replayed: boolean }> {
  const requestHash = hashCommerceProviderOperation({
    ...input.scope, provider: input.adapter.provider, operationType: "cancel",
    providerSubscriptionId: input.providerSubscriptionId,
  });
  const claim = await scopedTx(input.pool, input.scope, (client) => claimCommerceProviderOperationTx(client, {
    ...input.scope, provider: input.adapter.provider, operationType: "cancel",
    idempotencyKey: input.idempotencyKey, requestHash,
  }));
  const action = requireDispatch(claim);
  if (action !== "dispatch") return { replayed: true };
  try {
    await input.adapter.cancel({ providerSubscriptionId: input.providerSubscriptionId, idempotencyKey: input.idempotencyKey });
  } catch {
    return markUnknown(input.pool, input.scope, {
      provider: input.adapter.provider, idempotencyKey: input.idempotencyKey, requestHash,
    });
  }
  await scopedTx(input.pool, input.scope, (client) => completeCommerceProviderOperationTx(client, {
    ...input.scope, provider: input.adapter.provider, idempotencyKey: input.idempotencyKey, requestHash,
    providerObjectId: input.providerSubscriptionId,
  }));
  return { replayed: false };
}

export async function refundCommercePayment(input: {
  pool: Pool; adapter: CommerceProviderAdapter; scope: Scope; providerPaymentId: string;
  amountMinor: bigint; currency: string; idempotencyKey: string;
}): Promise<{ replayed: boolean }> {
  const requestHash = hashCommerceProviderOperation({
    ...input.scope, provider: input.adapter.provider, operationType: "refund",
    providerPaymentId: input.providerPaymentId, amountMinor: input.amountMinor, currency: input.currency,
  });
  const claim = await scopedTx(input.pool, input.scope, (client) => claimCommerceProviderOperationTx(client, {
    ...input.scope, provider: input.adapter.provider, operationType: "refund",
    idempotencyKey: input.idempotencyKey, requestHash,
  }));
  const action = requireDispatch(claim);
  if (action !== "dispatch") return { replayed: true };
  try {
    await input.adapter.refund({
      providerPaymentId: input.providerPaymentId, amountMinor: input.amountMinor,
      currency: input.currency, idempotencyKey: input.idempotencyKey,
    });
  } catch {
    return markUnknown(input.pool, input.scope, {
      provider: input.adapter.provider, idempotencyKey: input.idempotencyKey, requestHash,
    });
  }
  await scopedTx(input.pool, input.scope, (client) => completeCommerceProviderOperationTx(client, {
    ...input.scope, provider: input.adapter.provider, idempotencyKey: input.idempotencyKey, requestHash,
    providerObjectId: input.providerPaymentId,
  }));
  return { replayed: false };
}
