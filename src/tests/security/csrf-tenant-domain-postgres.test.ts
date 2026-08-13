import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { Pool, type PoolClient } from "pg";

import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { verifyCsrfOrigin } from "../../lib/csrf";
import { resetTenantHostDirectoryCache } from "../../lib/security/request-tenant-assertion";

// CSRF for white-label domains.
//
// verifyCsrfOrigin compared Origin against NEXT_PUBLIC_SITE_URL alone, so a
// browser on a bound custom domain sent that domain and every mutation returned
// 403 while reads resolved normally.
//
// The allowance added here is narrower than "an Origin that is a bound tenant
// domain", and that narrowness is the whole security argument: with two tenants
// bound, the broader rule would let a page on one mint state-changing requests
// against the other. Cross-tenant CSRF is a threat that does not exist while the
// allow-list is a single origin, so it must not be created while fixing this.
// The Origin must name the host the request was actually addressed to.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;
const cleanupTenants = new Set<string>();

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const env = process.env as Record<string, string | undefined>;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function bindDomain(host: string): Promise<string> {
  const tenantId = `tenant-csrf-${randomUUID()}`;
  const workspaceId = `ws-csrf-${randomUUID()}`;
  cleanupTenants.add(tenantId);
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO platform_workspaces
         (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
      [workspaceId, tenantId],
    );
    await client.query(
      `INSERT INTO platform_tenant_domains (host, tenant_id, workspace_id)
       VALUES ($1, $2, $3)`,
      [host, tenantId, workspaceId],
    );
  });
  return tenantId;
}

/** A POST addressed to `host`, sent by a page at `origin`. */
function post(host: string, origin: string | null): NextRequest {
  const headers: Record<string, string> = { host };
  if (origin) headers.origin = origin;
  return new NextRequest(`https://${host}/api/academy-certificates`, {
    method: "POST",
    headers,
  });
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

beforeEach(() => {
  env.NODE_ENV = "production";
  env.NEXT_PUBLIC_SITE_URL = "https://tecpey.ir";
  resetTenantHostDirectoryCache();
});

after(async () => {
  if (pool) {
    await withClient(async (client) => {
      for (const tenantId of cleanupTenants) {
        await client.query("DELETE FROM platform_tenants WHERE id = $1", [tenantId]);
      }
    });
  }
  await pool?.end();
  pool = null;
  if (ORIGINAL_NODE_ENV === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_SITE_URL === undefined) delete env.NEXT_PUBLIC_SITE_URL;
  else env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
  resetTenantHostDirectoryCache();
});

describe("CSRF on verified tenant domains", () => {
  it(
    "accepts a page on a bound domain posting to that same domain",
    { skip: !configured, timeout: 45_000 },
    async () => {
      const host = `csrf-own-${randomUUID().slice(0, 8)}.example.com`;
      await bindDomain(host);

      assert.equal(
        await verifyCsrfOrigin(post(host, `https://${host}`)),
        true,
        "a white-label tenant must be able to post to its own domain",
      );
    },
  );

  it(
    "refuses one bound tenant domain posting to another",
    { skip: !configured, timeout: 45_000 },
    async () => {
      // The load-bearing case. Both hosts are real, verified tenant domains, so
      // a rule of "any bound domain is same-site" would accept this and hand
      // one tenant a CSRF vector against another.
      const target = `csrf-target-${randomUUID().slice(0, 8)}.example.com`;
      const attacker = `csrf-other-${randomUUID().slice(0, 8)}.example.com`;
      await bindDomain(target);
      await bindDomain(attacker);

      assert.equal(
        await verifyCsrfOrigin(post(target, `https://${attacker}`)),
        false,
        "a second bound tenant is still a stranger",
      );
    },
  );

  it(
    "refuses an unbound origin claiming to be its own host",
    { skip: !configured, timeout: 45_000 },
    async () => {
      // Origin matches Host exactly, but nothing bound this domain. Host is
      // attacker-controlled, so matching itself proves nothing without the
      // directory.
      const host = `csrf-unbound-${randomUUID().slice(0, 8)}.example.com`;

      assert.equal(await verifyCsrfOrigin(post(host, `https://${host}`)), false);
    },
  );

  it(
    "refuses a bound domain reached over http in production",
    { skip: !configured, timeout: 45_000 },
    async () => {
      const host = `csrf-http-${randomUUID().slice(0, 8)}.example.com`;
      await bindDomain(host);

      assert.equal(
        await verifyCsrfOrigin(post(host, `http://${host}`)),
        false,
        "a downgraded origin must not be treated as the tenant's own",
      );
    },
  );

  it(
    "refuses a smuggled origin that mentions a bound host",
    { skip: !configured, timeout: 45_000 },
    async () => {
      const host = `csrf-smuggle-${randomUUID().slice(0, 8)}.example.com`;
      await bindDomain(host);

      for (const origin of [
        `https://${host}.attacker.example`,
        `https://attacker.example`,
        `https://user@${host}`,
      ]) {
        assert.equal(
          await verifyCsrfOrigin(post(host, origin)),
          false,
          `origin ${origin} must be refused`,
        );
      }
    },
  );

  it(
    "still accepts the platform's own site origin without consulting the directory",
    { skip: !configured, timeout: 45_000 },
    async () => {
      // The original control is untouched and still decides first, which is why
      // the default domain pays nothing for any of this.
      assert.equal(
        await verifyCsrfOrigin(post("tecpey.ir", "https://tecpey.ir")),
        true,
      );
      assert.equal(
        await verifyCsrfOrigin(post("tecpey.ir", "https://attacker.example")),
        false,
      );
    },
  );
});
