import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { runProCommerceAuthorityMigrations } from "../../lib/db-migrate-pro-commerce-authority";
import { runProCommerceLedgerHardeningMigrations } from "../../lib/db-migrate-pro-commerce-ledger-hardening";

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
    await runProCommerceLedgerHardeningMigrations(admin);
    await admin.query("INSERT INTO platform_tenants (id, slug, display_name, plan, products) VALUES ($1,$2,$3,\'enterprise\',\'{}\'),($4,$5,$6,\'enterprise\',\'{}\')", [tenantA,tenantA,tenantA,tenantB,tenantB,tenantB]);
    await admin.query("INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products) VALUES ($1,$2,$3,$4,\'{}\'),($5,$6,$7,$8,\'{}\')", [wsA,tenantA,wsA,wsA,wsB,tenantB,wsB,wsB]);
    await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    for (const table of ["commerce_plan_versions","commerce_subscriptions","commerce_provider_events","commerce_entitlement_snapshots","commerce_provider_operations","commerce_reconciliation_records","commerce_manual_entitlement_commands"]) {
      await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO "${role}"`);
    }
    await admin.query("INSERT INTO commerce_plan_versions (tenant_id,workspace_id,plan_key,version,status,currency,unit_amount_minor,billing_interval,capability_grants,legal_copy_version,effective_from) VALUES ($1,$2,'pro',1,'active','USD',1000,'month','{}','v1',NOW()),($3,$4,'pro',1,'active','USD',1000,'month','{}','v1',NOW())", [tenantA,wsA,tenantB,wsB]);
    await admin.query(`SET ROLE "${role}"`);
    await admin.query("SELECT set_config('app.tenant_id',$1,false), set_config('app.workspace_id',$2,false)", [tenantA,wsA]);
    const visible = await admin.query("SELECT tenant_id, workspace_id FROM commerce_plan_versions ORDER BY tenant_id");
    assert.deepEqual(visible.rows, [{ tenant_id: tenantA, workspace_id: wsA }]);
    const eventA = await admin.query("INSERT INTO commerce_provider_events (tenant_id,workspace_id,provider,provider_account_scope,provider_event_id,event_type,signature_verified,payload_sha256,payload_redacted,payload_expires_at,occurred_at) VALUES ($1,$2,'test','acct-a','evt-a','subscription.updated',TRUE,$3,'{}',NOW() + INTERVAL '1 day',NOW()) RETURNING id", [tenantA,wsA,"a".repeat(64)]);
    await admin.query("INSERT INTO commerce_reconciliation_records (tenant_id,workspace_id,provider_event_id,decision,reason_code) VALUES ($1,$2,$3,'applied','accepted_event')", [tenantA,wsA,eventA.rows[0].id]);
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM commerce_reconciliation_records")).rows[0].count, 1);
    await assert.rejects(admin.query("INSERT INTO commerce_reconciliation_records (tenant_id,workspace_id,provider_event_id,decision,reason_code) VALUES ($1,$2,$3,'applied','forged_scope')", [tenantB,wsB,eventA.rows[0].id]), /row-level security|foreign key/i);
    await assert.rejects(admin.query("INSERT INTO commerce_manual_entitlement_commands (tenant_id,workspace_id,account_id,command_type,idempotency_key,actor_account_id,reason_code,capabilities,effective_at) VALUES ($1,$2,'missing-account','grant',$3,'missing-actor','manual_test','{}',NOW())", [tenantB,wsB,"manual-forged-"+suffix]), /row-level security/i);
    await assert.rejects(admin.query("INSERT INTO commerce_plan_versions (tenant_id,workspace_id,plan_key,version,status,currency,unit_amount_minor,billing_interval,capability_grants,legal_copy_version,effective_from) VALUES ($1,$2,'forged',1,'active','USD',0,'month','{}','v1',NOW())", [tenantB,wsB]), /row-level security/i);
  } finally {
    await admin.query("RESET ROLE").catch(()=>{});
    await admin.query(`REASSIGN OWNED BY "${role}" TO CURRENT_USER`).catch(()=>{});
    await admin.query(`DROP OWNED BY "${role}"`).catch(()=>{});
    await admin.query(`DROP ROLE IF EXISTS "${role}"`).catch(()=>{});
    admin.release();
    await pool.end();
  }
});
