import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { readCommerceBillingAuthority } from "../../lib/commerce/commerce-billing-authority";
import { runProCommerceAuthorityMigrations } from "../../lib/db-migrate-pro-commerce-authority";
import { runProCommerceLedgerHardeningMigrations } from "../../lib/db-migrate-pro-commerce-ledger-hardening";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

test("billing authority rejects stale snapshots and remains tenant/workspace isolated", { skip: !databaseUrl, timeout: 45_000 }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const admin = await pool.connect();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenantA=`billing-a-${suffix}`, tenantB=`billing-b-${suffix}`;
  const wsA=`billing-wsa-${suffix}`, wsB=`billing-wsb-${suffix}`;
  const accountA=`billing-account-a-${suffix}`, accountB=`billing-account-b-${suffix}`;
  const role=`billing_read_${suffix}`;
  try {
    await runProCommerceAuthorityMigrations(admin);
    await runProCommerceLedgerHardeningMigrations(admin);
    await admin.query("INSERT INTO platform_tenants (id,slug,display_name,plan,products) VALUES ($1,$1,$1,'enterprise','{}'),($2,$2,$2,'enterprise','{}')",[tenantA,tenantB]);
    await admin.query("INSERT INTO platform_workspaces (id,tenant_id,slug,display_name,products) VALUES ($1,$2,$1,$1,'{}'),($3,$4,$3,$3,'{}')",[wsA,tenantA,wsB,tenantB]);
    await admin.query(`INSERT INTO academy_auth_accounts (id,email,username,display_name,password_hash) VALUES
      ($1,$2,$3,'Billing A','not-a-login-credential'),($4,$5,$6,'Billing B','not-a-login-credential')`,
      [accountA,`${suffix}-a@billing.invalid`,`billing_a_${suffix}`,accountB,`${suffix}-b@billing.invalid`,`billing_b_${suffix}`]);
    await admin.query(`INSERT INTO commerce_plan_versions
      (tenant_id,workspace_id,plan_key,version,status,currency,unit_amount_minor,billing_interval,capability_grants,legal_copy_version,effective_from)
      VALUES ($1,$2,'pro',1,'active','USD',1000,'month','{"mentor_pro":true}'::jsonb,'v1','2026-01-01'),
             ($3,$4,'pro',1,'active','USD',1000,'month','{"mentor_pro":true}'::jsonb,'v1','2026-01-01')`,
      [tenantA,wsA,tenantB,wsB]);
    const a=await admin.query<{id:string}>(`INSERT INTO commerce_subscriptions
      (tenant_id,workspace_id,account_id,provider,provider_account_scope,provider_subscription_id,plan_key,plan_version,state,effective_at,current_period_end,state_version)
      VALUES ($1,$2,$3,'testpay','merchant-a',$4,'pro',1,'active','2026-09-01','2026-10-01',3) RETURNING id`,
      [tenantA,wsA,accountA,`sub-a-${suffix}`]);
    await admin.query(`INSERT INTO commerce_entitlement_snapshots
      (tenant_id,workspace_id,account_id,subscription_id,snapshot_version,source_kind,capabilities,valid_from,valid_until)
      VALUES ($1,$2,$3,$4,2,'commercial_subscription','{"mentor_pro":true}'::jsonb,'2026-09-01','2026-10-01')`,
      [tenantA,wsA,accountA,a.rows[0].id]);
    const b=await admin.query<{id:string}>(`INSERT INTO commerce_subscriptions
      (tenant_id,workspace_id,account_id,provider,provider_account_scope,provider_subscription_id,plan_key,plan_version,state,effective_at,current_period_end,state_version)
      VALUES ($1,$2,$3,'testpay','merchant-b',$4,'pro',1,'active','2026-09-01','2026-10-01',1) RETURNING id`,
      [tenantB,wsB,accountB,`sub-b-${suffix}`]);
    await admin.query(`INSERT INTO commerce_entitlement_snapshots
      (tenant_id,workspace_id,account_id,subscription_id,snapshot_version,source_kind,capabilities,valid_from,valid_until)
      VALUES ($1,$2,$3,$4,1,'commercial_subscription','{"mentor_pro":true}'::jsonb,'2026-09-01','2026-10-01')`,
      [tenantB,wsB,accountB,b.rows[0].id]);

    await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    await admin.query(`GRANT SELECT ON commerce_subscriptions,commerce_entitlement_snapshots TO "${role}"`);
    await admin.query(`SET ROLE "${role}"`);
    await admin.query("SELECT set_config('app.tenant_id',$1,false),set_config('app.workspace_id',$2,false)",[tenantA,wsA]);

    const stale=await readCommerceBillingAuthority(admin,{tenantId:tenantA,workspaceId:wsA,accountId:accountA},new Date("2026-09-22T00:00:00Z"));
    assert.equal(stale.subscription?.stateVersion,3);
    assert.equal(stale.entitlement.active,false);
    assert.deepEqual(stale.entitlement.capabilities,{});
    assert.equal(stale.entitlement.snapshotVersion,2);

    const foreign=await readCommerceBillingAuthority(admin,{tenantId:tenantB,workspaceId:wsB,accountId:accountB},new Date("2026-09-22T00:00:00Z"));
    assert.equal(foreign.subscription,null);
    assert.equal(foreign.entitlement.active,false);
    assert.deepEqual(foreign.entitlement.capabilities,{});
  } finally {
    await admin.query("RESET ROLE").catch(()=>{});
    await admin.query(`REASSIGN OWNED BY "${role}" TO CURRENT_USER`).catch(()=>{});
    await admin.query(`DROP OWNED BY "${role}"`).catch(()=>{});
    await admin.query(`DROP ROLE IF EXISTS "${role}"`).catch(()=>{});
    admin.release();
    await pool.end();
  }
});
