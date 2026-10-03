import type { PoolClient } from "pg";

export type ArenaLeagueTenantScope = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

/**
 * Establishes transaction-local tenant/workspace context for Arena League RLS.
 * Callers must already be inside the transaction that performs scoped reads or writes.
 */
export async function applyArenaLeagueTenantScope(
  client: PoolClient,
  scope: ArenaLeagueTenantScope,
): Promise<void> {
  const tenantId = scope.tenantId.trim();
  const workspaceId = scope.workspaceId.trim();
  if (!tenantId || !workspaceId) throw new Error("arena_league_scope_invalid");

  await client.query(
    "SELECT set_config('app.tenant_id',$1,true), set_config('app.workspace_id',$2,true)",
    [tenantId, workspaceId],
  );
}
