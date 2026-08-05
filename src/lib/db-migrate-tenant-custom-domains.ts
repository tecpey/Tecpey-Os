import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0054_tenant_custom_domains.sql";

// Tenant custom domains — the host→tenant authority for multi-tenancy (#20 P2).
//
// A white-label tenant reaches the platform on a hostname it owns. This table
// is the SINGLE authority mapping such a hostname to the tenant/workspace a
// request on that host resolves to. The Host header is untrusted, so a host
// with no row here yields no hint and resolution falls back to the
// authenticated session (see src/lib/security/tenant-host-resolution.ts and
// src/lib/security/tenant-domain-directory.ts).
//
// Two invariants are enforced by the schema, not by application code:
//   1. host is the PRIMARY KEY, so a hostname belongs to exactly one tenant —
//      two tenants can never claim the same host.
//   2. The composite FK (tenant_id, workspace_id) -> platform_workspaces
//      (tenant_id, id) makes a cross-tenant workspace binding impossible: a
//      domain can only pin a workspace that lives in its own tenant. This is
//      the database-enforced twin of the pure resolver's invariant that a
//      tenant is never paired with another tenant's workspace. It reuses the
//      UNIQUE (tenant_id, id) key that migration 0053 added to
//      platform_workspaces.
//
// Hosts are stored already normalized (lowercase, punycode, no port, no
// trailing dot) — the same canonical form normalizeHostHeader derives from an
// incoming request.
export const TENANT_CUSTOM_DOMAINS_SQL = `
CREATE TABLE IF NOT EXISTS platform_tenant_domains (
  host         TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- host must already be in canonical form: lowercase ASCII labels
  -- (a-z, 0-9, hyphen) separated by single dots, no port, no leading/trailing
  -- dot, no empty labels, no uppercase, no IDN (punycode 'xn--…' is ASCII and
  -- passes). This is what normalizeHostHeader() produces, and it is what makes
  -- the PRIMARY KEY a normalized-uniqueness guarantee rather than a mere
  -- byte-uniqueness one: two hosts that normalize to the same key have the same
  -- canonical bytes, so 'acme.com', 'ACME.com', and 'acme.com.' can never be
  -- claimed by different tenants — only the single canonical 'acme.com' is
  -- storable at all.
  CONSTRAINT platform_tenant_domains_host_canonical CHECK (
    host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)*$'
  ),
  CONSTRAINT platform_tenant_domains_workspace_in_tenant
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS platform_tenant_domains_tenant_idx
  ON platform_tenant_domains(tenant_id);

-- At most one primary domain per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS platform_tenant_domains_one_primary
  ON platform_tenant_domains(tenant_id) WHERE is_primary;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runTenantCustomDomainsMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(TENANT_CUSTOM_DOMAINS_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-tenant-custom-domains] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-tenant-custom-domains] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(TENANT_CUSTOM_DOMAINS_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
