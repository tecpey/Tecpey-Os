// Tenant custom-domain directory (multi-tenant #20 P2).
//
// Bridges the `platform_tenant_domains` table to the pure host-hint resolver in
// tenant-host-resolution.ts. It loads the host→tenant bindings and returns a
// `TenantHostLookup` — the synchronous callback `resolveTenantHostHint` expects
// — so the request edge (src/proxy.ts, a later phase) can build the directory
// once, cache it, and resolve each request's Host header against it without a
// per-request query.
//
// The table is the SINGLE authority for host→tenant: a host with no row yields
// no binding, so an unlisted or spoofed host produces no hint and resolution
// falls through to the authenticated session. Rows are stored already
// normalized, but we normalize each stored host again on load so a mis-stored
// row can never shadow a correct key or match an un-normalized incoming host.

import {
  normalizeHostHeader,
  type TenantHostBinding,
  type TenantHostLookup,
} from "./tenant-host-resolution";

/** Minimal query surface — a `pg` Pool/PoolClient satisfies this, as do fakes. */
export interface TenantDomainQuerier {
  query<Row>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
}

type TenantDomainRow = {
  host: string;
  tenant_id: string;
  workspace_id: string;
};

/**
 * Load every tenant custom domain into an in-memory host→binding map and return
 * a synchronous lookup over it. The map key is the normalized host, matching
 * exactly the key `resolveTenantHostHint` derives from an incoming Host header.
 * A row whose stored host fails normalization, or whose tenant/workspace is
 * blank, is skipped rather than trusted.
 */
export async function loadTenantHostDirectory(
  db: TenantDomainQuerier,
): Promise<TenantHostLookup> {
  const { rows } = await db.query<TenantDomainRow>(
    "SELECT host, tenant_id, workspace_id FROM platform_tenant_domains",
  );

  const directory = new Map<string, TenantHostBinding>();
  for (const row of rows) {
    const host = normalizeHostHeader(row.host);
    if (host === null) continue;
    const tenantId = typeof row.tenant_id === "string" ? row.tenant_id.trim() : "";
    const workspaceId =
      typeof row.workspace_id === "string" ? row.workspace_id.trim() : "";
    if (!tenantId || !workspaceId) continue;
    directory.set(host, { tenantId, workspaceId });
  }

  return (host: string): TenantHostBinding | null => directory.get(host) ?? null;
}
