import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";

import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { isProductEnabledForTenant } from "../../lib/product-registry";
import {
  requireTenantProduct,
  resetTenantProductEntitlementCache,
  tenantProductVerdict,
} from "../../lib/security/tenant-product-entitlement";

// The tenant's product entitlement (multi-tenant #20, section 3.3).
//
// platform_tenants.products[] has been on the row since migration 0001 and read
// by nothing, so a tenant provisioned without Academy was served every Academy
// route exactly like one that bought it. These cases are what that column now
// decides.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

async function provision(
  client: PoolClient,
  products: string[],
): Promise<string> {
  const tenantId = `tenant-ent-${randomUUID()}`;
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', $2::text[])`,
    [tenantId, products],
  );
  return tenantId;
}

async function removeTenant(tenantId: string): Promise<void> {
  const client = await pool!.connect();
  try {
    await client.query("DELETE FROM platform_tenants WHERE id = $1", [tenantId]);
  } finally {
    client.release();
  }
}

/** Commit the fixture: the entitlement is read on its own connection. */
async function withProvisionedTenant<T>(
  products: string[],
  fn: (tenantId: string) => Promise<T>,
): Promise<T> {
  const client = await pool!.connect();
  let tenantId: string;
  try {
    tenantId = await provision(client, products);
  } finally {
    client.release();
  }
  resetTenantProductEntitlementCache();
  try {
    return await fn(tenantId);
  } finally {
    resetTenantProductEntitlementCache();
    await removeTenant(tenantId);
  }
}

async function withFlag<T>(
  envVar: string,
  value: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = process.env[envVar];
  if (value === undefined) delete process.env[envVar];
  else process.env[envVar] = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env[envVar];
    else process.env[envVar] = previous;
  }
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
  } finally {
    client.release();
  }
});

after(async () => {
  const closing = pool;
  pool = null;
  if (!closing) return;
  await Promise.race([
    closing.end(),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
});

describe("Tenant product entitlement", () => {
  describe("the decision itself", () => {
    it("needs the platform flag and the tenant's entitlement, not either alone", () => {
      // The two gates are independent: a platform can run Academy while a
      // white-label tenant bought only Exchange, and a tenant entitled to a
      // product must still not be served it where the platform has it off.
      assert.equal(
        isProductEnabledForTenant({ products: ["academy"] }, "academy"),
        true,
      );
      assert.equal(
        isProductEnabledForTenant({ products: ["exchange"] }, "academy"),
        false,
        "an entitlement to another product is not an entitlement to this one",
      );
    });

    it("treats an empty or absent entitlement as entitled to nothing", () => {
      // Fail-closed. An empty products[] is not "unspecified, so allow", and a
      // tenant the caller could not resolve is not a reason to serve it.
      assert.equal(isProductEnabledForTenant({ products: [] }, "academy"), false);
      assert.equal(isProductEnabledForTenant(null, "academy"), false);
      assert.equal(isProductEnabledForTenant(undefined, "academy"), false);
    });

    it("refuses a product the platform is not running, however entitled", async () => {
      await withFlag("FEATURE_ACADEMY_ENABLED", "false", async () => {
        assert.equal(
          isProductEnabledForTenant({ products: ["academy"] }, "academy"),
          false,
        );
      });
      // And is enabled again once the flag is back, so the case above is the
      // flag talking rather than a permanently false answer.
      assert.equal(
        isProductEnabledForTenant({ products: ["academy"] }, "academy"),
        true,
      );
    });
  });

  describe("against a provisioned tenant", () => {
    it(
      "serves a product the tenant was provisioned with",
      { skip: !configured, timeout: 45_000 },
      async () => {
        await withProvisionedTenant(["academy", "mentor"], async (tenantId) => {
          assert.deepEqual(await tenantProductVerdict(tenantId, "academy"), {
            entitled: true,
          });
          assert.deepEqual(await tenantProductVerdict(tenantId, "mentor"), {
            entitled: true,
          });
        });
      },
    );

    it(
      "refuses a product the tenant was not provisioned with",
      { skip: !configured, timeout: 45_000 },
      async () => {
        // The case that fails against the code as it stood: this tenant exists,
        // its students resolve, and every Academy route served it.
        await withProvisionedTenant(["mentor"], async (tenantId) => {
          assert.deepEqual(await tenantProductVerdict(tenantId, "academy"), {
            entitled: false,
            reason: "product_not_entitled",
          });
        });
      },
    );

    it(
      "refuses a tenant provisioned with nothing",
      { skip: !configured, timeout: 45_000 },
      async () => {
        await withProvisionedTenant([], async (tenantId) => {
          assert.deepEqual(await tenantProductVerdict(tenantId, "academy"), {
            entitled: false,
            reason: "product_not_entitled",
          });
        });
      },
    );

    it(
      "refuses a tenant that does not exist at all",
      { skip: !configured, timeout: 45_000 },
      async () => {
        resetTenantProductEntitlementCache();
        assert.deepEqual(
          await tenantProductVerdict(`tenant-absent-${randomUUID()}`, "academy"),
          { entitled: false, reason: "product_not_entitled" },
        );
      },
    );

    it(
      "refuses a disabled product before it reads any entitlement",
      { skip: !configured, timeout: 45_000 },
      async () => {
        // The discriminator is the reason: a tenant id no row matches would
        // answer product_not_entitled if the entitlement had been read, so
        // product_disabled is only reachable by refusing first.
        await withFlag("FEATURE_ACADEMY_ENABLED", "false", async () => {
          resetTenantProductEntitlementCache();
          assert.deepEqual(
            await tenantProductVerdict(`tenant-absent-${randomUUID()}`, "academy"),
            { entitled: false, reason: "product_disabled" },
          );
        });
      },
    );

    it(
      "answers routes with a response to return, or nothing to return",
      { skip: !configured, timeout: 45_000 },
      async () => {
        await withProvisionedTenant(["academy"], async (entitled) => {
          assert.equal(
            await requireTenantProduct(entitled, "academy"),
            null,
            "an entitled tenant is not stopped",
          );
        });
        await withProvisionedTenant(["mentor"], async (unentitled) => {
          const refusal = await requireTenantProduct(unentitled, "academy");
          assert.ok(refusal, "an unentitled tenant must be stopped");
          assert.equal(refusal.status, 403);
          assert.deepEqual(await refusal.json(), {
            ok: false,
            error: "product_not_entitled",
          });
        });
      },
    );

    it(
      "turns a failed entitlement read into an unavailable verdict, not a throw",
      { skip: !configured, timeout: 45_000 },
      async () => {
        // withDb reports a missing pool as unavailable, but a live pool that
        // errors on the query rethrows. Without the catch that rejection escapes
        // requireTenantProduct and the route answers 500 instead of the
        // documented 503. A tenant id carrying a NUL byte is rejected by
        // Postgres before the SELECT can run, so the read throws inside withDb —
        // and must still resolve to a verdict rather than propagate.
        resetTenantProductEntitlementCache();
        const nulTenant = "tenant\u0000id";
        assert.deepEqual(await tenantProductVerdict(nulTenant, "academy"), {
          entitled: false,
          reason: "entitlement_unavailable",
        });
        // And the guard answers 503, not an unhandled rejection.
        const refusal = await requireTenantProduct(nulTenant, "academy");
        assert.ok(refusal);
        assert.equal(refusal.status, 503);
      },
    );

    it(
      "reads the entitlement once and then from cache until it is reset",
      { skip: !configured, timeout: 45_000 },
      async () => {
        // The cache is the reason a changed entitlement takes up to one TTL to
        // take effect, so it is asserted rather than assumed: the same tenant
        // answers from the cached value after the row itself has changed, and
        // answers from the row again once the cache is dropped.
        await withProvisionedTenant([], async (tenantId) => {
          assert.deepEqual(await tenantProductVerdict(tenantId, "academy"), {
            entitled: false,
            reason: "product_not_entitled",
          });

          const client = await pool!.connect();
          try {
            await client.query(
              "UPDATE platform_tenants SET products = ARRAY['academy'] WHERE id = $1",
              [tenantId],
            );
          } finally {
            client.release();
          }

          assert.deepEqual(
            await tenantProductVerdict(tenantId, "academy"),
            { entitled: false, reason: "product_not_entitled" },
            "the cached entitlement still answers",
          );

          resetTenantProductEntitlementCache();
          assert.deepEqual(
            await tenantProductVerdict(tenantId, "academy"),
            { entitled: true },
            "and the row answers once the cache is dropped",
          );
        });
      },
    );
  });
});
