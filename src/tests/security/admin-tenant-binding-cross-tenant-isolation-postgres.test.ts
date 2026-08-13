import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { Pool, type PoolClient } from "pg";
import {
  ADMIN_CONTROL_SESSION_COOKIE,
  createAdminControlSessionToken,
  loadAdminPrincipal,
} from "../../lib/admin-control-plane";
import { COMMAND_CENTER_METRICS } from "../../lib/admin-command-center-scopes";
import { GET as adminWithdrawals } from "../../app/api/admin/withdrawals/route";
import { GET as commandCenterSummary } from "../../app/api/command-center/summary/route";

// Load-bearing guard for the admin control plane's tenant boundary (F-1).
//
// admin-control-plane.ts contained zero references to a tenant: authorizeAdminRequest
// checked a permission and nothing else, so every admin read ran across the whole
// platform. Migration 0069 gives admin_users a tenant, loadAdminPrincipal carries it,
// and the two admin reads whose tables actually have a tenant column now filter on it.
//
// Both tenants here are freshly minted — neither is the default 'tecpey'. That is
// deliberate: if a reader hard-coded PLATFORM.DEFAULT_TENANT_ID instead of reading
// principal.tenantId, every assertion below would see an empty result rather than
// quietly passing, which is the failure mode a default-tenant fixture hides.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

const TENANT_A = `tenant-a-${randomUUID()}`;
const WORKSPACE_A = `ws-a-${randomUUID()}`;
const TENANT_B = `tenant-b-${randomUUID()}`;
const WORKSPACE_B = `ws-b-${randomUUID()}`;

const STUDENT_ID = randomUUID();
const WITHDRAWAL_A = randomUUID().replaceAll("-", "").slice(0, 32);
const WITHDRAWAL_B1 = randomUUID().replaceAll("-", "").slice(0, 32);
const WITHDRAWAL_B2 = randomUUID().replaceAll("-", "").slice(0, 32);
// A settled withdrawal in tenant B, to prove the state filter survived the
// tenant predicate rather than being replaced by it.
const WITHDRAWAL_B_DONE = randomUUID().replaceAll("-", "").slice(0, 32);

const ADMIN_SESSION_SECRET = "tecpey-admin-tenant-binding-test-secret-32chars";
let originalAdminSecret: string | undefined;
let originalMemoryRateLimit: string | undefined;

let pool: Pool | null = null;
let cookieA = "";
let cookieB = "";
let adminIdA = "";
let adminIdB = "";

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function seedTenant(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
    [tenantId],
  );
  await client.query(
    `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
    [workspaceId, tenantId],
  );
  await client.query(
    `INSERT INTO platform_principal_bindings
       (tenant_id, workspace_id, principal_type, principal_id, status, source)
     VALUES ($1, $2, 'student', $3, 'active', 'admin-tenant-binding-test')`,
    [tenantId, workspaceId, STUDENT_ID],
  );
}

/** Creates an active super_admin in `tenantId` and returns its session cookie. */
async function seedAdmin(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
): Promise<{ adminId: string; cookie: string }> {
  const admin = await client.query<{ id: string }>(
    `INSERT INTO admin_users (email, display_name, status, tenant_id, workspace_id)
       VALUES ($1, $2, 'active', $3, $4)
     RETURNING id::text AS id`,
    [`admin-${tenantId}@tecpey.test`, `admin ${tenantId}`, tenantId, workspaceId],
  );
  const adminId = admin.rows[0]!.id;

  await client.query(
    `INSERT INTO admin_user_roles (admin_id, role_id) VALUES ($1::uuid, 'super_admin')`,
    [adminId],
  );

  const jti = randomUUID();
  const session = await client.query<{ id: string; permission_version: number }>(
    `INSERT INTO admin_sessions (
       admin_id, jti, permission_version, authentication_methods,
       step_up_at, idle_expires_at, absolute_expires_at
     )
     SELECT $1::uuid, $2, u.permission_version, '["password","totp"]'::jsonb,
            NOW(), NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours'
       FROM admin_users u WHERE u.id = $1::uuid
     RETURNING id::text AS id, permission_version`,
    [adminId, jti],
  );
  const row = session.rows[0]!;

  const token = await createAdminControlSessionToken(
    {
      adminId,
      sessionId: row.id,
      jti,
      permissionVersion: row.permission_version,
      authenticationMethods: ["password", "totp"],
      stepUpAt: new Date().toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
    ADMIN_SESSION_SECRET,
  );

  return { adminId, cookie: `${ADMIN_CONTROL_SESSION_COOKIE}=${token}` };
}

async function seedLessons(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await client.query(
      `INSERT INTO learning_events
         (student_id, event_type, payload, tenant_id, workspace_id, principal_type, principal_id)
       VALUES ($1::uuid, 'lesson_completed', '{}'::jsonb, $2, $3, 'student', $1::text)`,
      [STUDENT_ID, tenantId, workspaceId],
    );
  }
}

async function seedWithdrawal(
  client: PoolClient,
  input: { id: string; tenantId: string; state: string; createdAt: string },
): Promise<void> {
  await client.query(
    `INSERT INTO withdrawals (
       id, tenant_id, user_id, asset, amount, amount_usd, destination_address,
       network, state, security_gate_passed, ip, user_agent, two_fa_verified,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, 'USDT', '1.00', 1.00, $4,
       'ethereum', $5, TRUE, '127.0.0.1', 'admin-tenant-binding-test', TRUE,
       $6::timestamptz, $6::timestamptz
     )`,
    [
      input.id,
      input.tenantId,
      `user-${input.id}`,
      `0x${input.id.slice(0, 40).padEnd(40, "0")}`,
      input.state,
      input.createdAt,
    ],
  );
}

function request(url: string, cookie: string): NextRequest {
  return new NextRequest(url, {
    method: "GET",
    headers: {
      cookie,
      "user-agent": "admin-tenant-binding-test",
      "x-forwarded-for": "127.0.0.1",
    },
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

before(async () => {
  originalAdminSecret = process.env.TECPEY_ADMIN_SESSION_SECRET;
  originalMemoryRateLimit = process.env.TECPEY_ALLOW_MEMORY_RATE_LIMIT;
  process.env.TECPEY_ADMIN_SESSION_SECRET = ADMIN_SESSION_SECRET;
  process.env.TECPEY_ALLOW_MEMORY_RATE_LIMIT = "1";

  if (!configured) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4 });

  await withClient(async (client) => {
    await client.query(
      `INSERT INTO academy_students (id, locale) VALUES ($1::uuid, 'fa')`,
      [STUDENT_ID],
    );
    await seedTenant(client, TENANT_A, WORKSPACE_A);
    await seedTenant(client, TENANT_B, WORKSPACE_B);

    const a = await seedAdmin(client, TENANT_A, WORKSPACE_A);
    adminIdA = a.adminId;
    cookieA = a.cookie;
    const b = await seedAdmin(client, TENANT_B, WORKSPACE_B);
    adminIdB = b.adminId;
    cookieB = b.cookie;

    await seedLessons(client, TENANT_A, WORKSPACE_A, 1);
    await seedLessons(client, TENANT_B, WORKSPACE_B, 2);

    await seedWithdrawal(client, {
      id: WITHDRAWAL_A,
      tenantId: TENANT_A,
      state: "pending",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    await seedWithdrawal(client, {
      id: WITHDRAWAL_B1,
      tenantId: TENANT_B,
      state: "pending",
      createdAt: "2024-01-02T00:00:00.000Z",
    });
    await seedWithdrawal(client, {
      id: WITHDRAWAL_B2,
      tenantId: TENANT_B,
      state: "compliance_review",
      createdAt: "2024-01-03T00:00:00.000Z",
    });
    await seedWithdrawal(client, {
      id: WITHDRAWAL_B_DONE,
      tenantId: TENANT_B,
      state: "completed",
      createdAt: "2024-01-04T00:00:00.000Z",
    });
  });
});

after(async () => {
  if (process.env.TECPEY_ADMIN_SESSION_SECRET !== undefined) {
    if (originalAdminSecret === undefined) delete process.env.TECPEY_ADMIN_SESSION_SECRET;
    else process.env.TECPEY_ADMIN_SESSION_SECRET = originalAdminSecret;
  }
  if (originalMemoryRateLimit === undefined) delete process.env.TECPEY_ALLOW_MEMORY_RATE_LIMIT;
  else process.env.TECPEY_ALLOW_MEMORY_RATE_LIMIT = originalMemoryRateLimit;

  if (!pool) return;
  await withClient(async (client) => {
    await client.query("DELETE FROM withdrawals WHERE id = ANY($1::text[])", [
      [WITHDRAWAL_A, WITHDRAWAL_B1, WITHDRAWAL_B2, WITHDRAWAL_B_DONE],
    ]);
    await client.query("DELETE FROM learning_events WHERE student_id = $1::uuid", [STUDENT_ID]);
    // Inserting an academy_student fires triggers that create a default-tenant
    // principal binding and a community profile, and the profile holds the
    // binding down with ON DELETE RESTRICT. Dropping the student first cascades
    // the profile (and its reputation consent) away so the bindings can go.
    await client.query("DELETE FROM academy_students WHERE id = $1::uuid", [STUDENT_ID]);
    await client.query(
      "DELETE FROM platform_principal_bindings WHERE principal_id = $1",
      [STUDENT_ID],
    );
    // admin_sessions and admin_user_roles cascade from admin_users.
    await client.query("DELETE FROM admin_users WHERE tenant_id = ANY($1::text[])", [
      [TENANT_A, TENANT_B],
    ]);
    await client.query("DELETE FROM platform_workspaces WHERE tenant_id = ANY($1::text[])", [
      [TENANT_A, TENANT_B],
    ]);
    await client.query("DELETE FROM platform_tenants WHERE id = ANY($1::text[])", [
      [TENANT_A, TENANT_B],
    ]);
  });
  await pool.end();
  pool = null;
});

describe("Admin control plane tenant binding", () => {
  it(
    "resolves each operator's own tenant rather than a platform default",
    { skip: !configured },
    async () => {
      const principalA = await loadAdminPrincipal(
        request("https://tecpey.ir/api/admin/withdrawals", cookieA),
      );
      assert.notEqual(principalA, "unavailable");
      assert.ok(principalA && principalA !== "unavailable");
      assert.equal(principalA.adminId, adminIdA);
      assert.equal(principalA.tenantId, TENANT_A);
      assert.equal(principalA.workspaceId, WORKSPACE_A);

      const principalB = await loadAdminPrincipal(
        request("https://tecpey.ir/api/admin/withdrawals", cookieB),
      );
      assert.ok(principalB && principalB !== "unavailable");
      assert.equal(principalB.adminId, adminIdB);
      assert.equal(principalB.tenantId, TENANT_B);
      assert.equal(principalB.workspaceId, WORKSPACE_B);
    },
  );

  it(
    "scopes the withdrawal review queue to the operator's tenant",
    { skip: !configured },
    async () => {
      const responseB = await adminWithdrawals(
        request("https://tecpey.ir/api/admin/withdrawals", cookieB),
      );
      assert.equal(responseB.status, 200);
      const bodyB = await readJson(responseB);
      const idsB = (bodyB.withdrawals as { id: string }[]).map((row) => row.id);
      // Ordered by created_at ASC; the completed one is excluded by the state
      // filter, and tenant A's pending one by the tenant filter.
      assert.deepEqual(idsB, [WITHDRAWAL_B1, WITHDRAWAL_B2]);

      const responseA = await adminWithdrawals(
        request("https://tecpey.ir/api/admin/withdrawals", cookieA),
      );
      assert.equal(responseA.status, 200);
      const bodyA = await readJson(responseA);
      const idsA = (bodyA.withdrawals as { id: string }[]).map((row) => row.id);
      assert.deepEqual(idsA, [WITHDRAWAL_A]);
    },
  );

  it(
    "scopes the Command Center event aggregate to the operator's tenant",
    { skip: !configured },
    async () => {
      const responseB = await commandCenterSummary(
        request("https://tecpey.ir/api/command-center/summary", cookieB),
      );
      assert.equal(responseB.status, 200);
      const bodyB = await readJson(responseB);
      assert.equal(bodyB.tenantId, TENANT_B);
      assert.equal(bodyB.workspaceId, WORKSPACE_B);
      const summaryB = bodyB.summary as { events: { event_type: string; count: number }[] };
      assert.deepEqual(
        summaryB.events.filter((row) => row.event_type === "lesson_completed"),
        [{ event_type: "lesson_completed", count: 2 }],
      );

      const responseA = await commandCenterSummary(
        request("https://tecpey.ir/api/command-center/summary", cookieA),
      );
      assert.equal(responseA.status, 200);
      const bodyA = await readJson(responseA);
      assert.equal(bodyA.tenantId, TENANT_A);
      const summaryA = bodyA.summary as { events: { event_type: string; count: number }[] };
      assert.deepEqual(
        summaryA.events.filter((row) => row.event_type === "lesson_completed"),
        [{ event_type: "lesson_completed", count: 1 }],
      );

      // The platform-labelled aggregates are honestly labelled: two operators in
      // different tenants read the identical number, because no boundary is
      // applied to them at all.
      const studentsA = (bodyA.summary as { students: { total: number } }).students;
      const studentsB = (bodyB.summary as { students: { total: number } }).students;
      assert.equal(studentsA.total, studentsB.total);
    },
  );

  it(
    "labels every metric with the scope its source table can actually carry",
    { skip: !configured },
    async () => {
      const tables = Object.values(COMMAND_CENTER_METRICS).map((metric) => metric.table);
      const columns = await withClient(async (client) =>
        client.query<{ table_name: string }>(
          `SELECT table_name
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND column_name = 'tenant_id'
              AND table_name = ANY($1::text[])`,
          [tables],
        ),
      );
      const tenantCapable = new Set(columns.rows.map((row) => row.table_name));

      // Every table must resolve, so a renamed table cannot silently pass the
      // check by matching nothing.
      const known = await withClient(async (client) =>
        client.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
          [tables],
        ),
      );
      assert.deepEqual(
        [...known.rows.map((row) => row.table_name)].sort(),
        [...tables].sort(),
        "every declared Command Center metric source must be a real table",
      );

      const dishonest: string[] = [];
      for (const [name, metric] of Object.entries(COMMAND_CENTER_METRICS)) {
        const capable = tenantCapable.has(metric.table);
        if (metric.scope === "tenant" && !capable) {
          dishonest.push(`${name}: labelled tenant but ${metric.table} has no tenant_id`);
        }
        if (metric.scope === "platform" && capable) {
          dishonest.push(
            `${name}: labelled platform but ${metric.table} now has tenant_id — scope the query`,
          );
        }
      }
      assert.deepEqual(dishonest, [], dishonest.join("; "));
    },
  );
});
