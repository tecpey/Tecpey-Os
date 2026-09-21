import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { runProCommerceAuthorityMigrations } from "../../lib/db-migrate-pro-commerce-authority";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

test("commerce authority enforces tenant/workspace RLS fail-closed", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const admin = await pool.connect();
  const suffix = Math.random().toString(16).slice(2, 10);
  const tenantA = `commerce-a-${suffix}`, tenantB = `commerce-b-${suffix}`;
  const wsA = `commerce-wsa-${suffix}`, wsB = `commerce-wsb-${suffix}`;
  const role = `commerce_rls_${suffix}`;
  try {
    await runProCommerceAuthorityMigrations(admin);
    await admin.query("INSERT INTO platform_tenants (id, name) VALUES ($1,$2),($3,$4)", [tenantA,tenantA,tenantB,tenantB]);
    await admin.query("INSERT INTO platform_workspaces (id, tenant_id, name) VALUES ($1,$2,$3),($4,$5,$6)", [wsA,tenantA,wsA,wsB,tenantB,wsB]);
    await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    for (const table of ["commerce_plan_versions","commerce_subscriptions","commerce_provider_events","commerce_entitlement_snapshots","commerce_provider_operations"]) {
      await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO "${role}"`);
    }
    await admin.query("INSERT INTO commerce_plan_versions (tenant_id,workspace_id,plan_key,version,status,currency,unit_amount_minor,billing_interval,capability_grants,legal_copy_version,effective_from) VALUES ($1,$2,'pro',1,'active','USD',1000,'month','{}','v1',NOW()),($3,$4,'pro',1,'active','USD',1000,'month','{}','v1',NOW())", [tenantA,wsA,tenantB,wsB]);
    await admin.query(`SET ROLE "${role}"`);
    await admin.query("SELECT set_config('app.tenant_id',$1,false), set_config('app.workspace_id',$2,false)", [tenantA,wsA]);
    const visible = await admin.query("SELECT tenant_id, workspace_id FROM commerce_plan_versions ORDER BY tenant_id");
    assert.deepEqual(visible.rows, [{ tenant_id: tenantA, workspace_id: wsA }]);
    await assert.rejects(admin.query("INSERT INTO commerce_plan_versions (tenant_id,workspace_id,plan_key,version,status,currency,unit_amount_minor,billing_interval,capability_grants,legal_copy_version,effective_from) VALUES ($1,$2,'forged',1,'active','USD',0,'month','{}','v1',NOW())", [tenantB,wsB]), /row-level security/i);
  } finally {
    await admin.query("RESET ROLE").catch(()=>{});
    await admin.query(`DROP ROLE IF EXISTS "${role}"`).catch(()=>{});
    await admin.query("DELETE FROM commerce_plan_versions WHERE tenant_id = ANY($1::text[])", [[tenantA,tenantB]]).catch(()=>{});
    await admin.query("DELETE FROM platform_workspaces WHERE tenant_id = ANY($1::text[])", [[tenantA,tenantB]]).catch(()=>{});
    await admin.query("DELETE FROM platform_tenants WHERE id = ANY($1::text[])", [[tenantA,tenantB]]).catch(()=>{});
    admin.release();
    await pool.end();
  }
});
