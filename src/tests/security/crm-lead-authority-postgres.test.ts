import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  claimCrmLeadDeliveries,
  deliverCrmLeadClaim,
  ingestAcademyLead,
  type AcademyLeadCommand,
} from "../../lib/crm/lead-authority";
import { decryptLeadPii } from "../../lib/crm/lead-pii";
import { deleteCrmLeadData, exportCrmLeadData } from "../../lib/crm/lead-data-rights";
import { PLATFORM } from "../../lib/platform-config";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;
const originalFetch = globalThis.fetch;
const originalWebhookUrl = process.env.ACADEMY_LEADS_WEBHOOK_URL;
const originalWebhookSecret = process.env.TECPEY_CRM_WEBHOOK_SECRET;

function uniquePhone(): string {
  const suffix = Math.floor(Math.random() * 900_000_000 + 100_000_000).toString();
  return `+989${suffix}`;
}

function command(overrides: Partial<AcademyLeadCommand> = {}): AcademyLeadCommand {
  return {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    idempotencyKey: `crm-test-${randomUUID()}`,
    leadKind: "academy_specialized",
    source: "security-test",
    locale: "fa",
    pii: {
      name: "کاربر تست امنیت",
      phone: uniquePhone(),
      email: `lead-${randomUUID()}@example.test`,
      city: "Babol",
      note: "No plaintext should remain in relational columns.",
    },
    attributes: { mode: "online", track: "risk-first-trading" },
    consent: true,
    legalBasis: "consent",
    privacyNoticeVersion: "academy-leads-test-v1",
    networkFingerprint: "a".repeat(64),
    ...overrides,
  };
}

async function inTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  await client.query("BEGIN");
  try {
    const value = await handler(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  process.env.TECPEY_CRM_PII_KEY_B64 ||= Buffer.alloc(32, 11).toString("base64");
  process.env.TECPEY_CRM_CONTACT_HASH_SECRET ||= "crm-postgres-test-contact-hash-secret-32-min";
  process.env.TECPEY_CRM_WEBHOOK_SECRET ||= "crm-postgres-test-webhook-secret-32-minimum";
  pool = new Pool({ connectionString: databaseUrl, max: 16 });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
  } finally {
    client.release();
  }
});

after(async () => {
  globalThis.fetch = originalFetch;
  if (originalWebhookUrl === undefined) delete process.env.ACADEMY_LEADS_WEBHOOK_URL;
  else process.env.ACADEMY_LEADS_WEBHOOK_URL = originalWebhookUrl;
  if (originalWebhookSecret === undefined) delete process.env.TECPEY_CRM_WEBHOOK_SECRET;
  else process.env.TECPEY_CRM_WEBHOOK_SECRET = originalWebhookSecret;
  await pool?.end();
  pool = null;
});

describe("CRM lead PostgreSQL authority", () => {
  it("replays the exact idempotent command and rejects changed reuse", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const original = command();
    const first = await ingestAcademyLead(original);
    const replay = await ingestAcademyLead(original);
    const conflict = await ingestAcademyLead({
      ...original,
      pii: { ...original.pii, name: "Changed name" },
    });

    assert.equal(first.status, "committed");
    assert.equal(replay.status, "committed");
    if (first.status === "committed" && replay.status === "committed") {
      assert.equal(first.result.created, true);
      assert.equal(first.result.replayed, false);
      assert.equal(replay.result.id, first.result.id);
      assert.equal(replay.result.replayed, true);
      assert.equal(replay.result.revision, 1);
    }
    assert.deepEqual(conflict, { status: "conflict" });

    const leadId = first.status === "committed" ? first.result.id : randomUUID();
    const evidence = await pool!.query<{ commands: string; leads: string; outbox: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM crm_lead_commands WHERE idempotency_key = $1) AS commands,
         (SELECT COUNT(*)::text FROM crm_leads WHERE id = $2::uuid) AS leads,
         (SELECT COUNT(*)::text FROM crm_lead_delivery_outbox WHERE lead_id = $2::uuid) AS outbox`,
      [original.idempotencyKey, leadId],
    );
    assert.deepEqual(evidence.rows[0], { commands: "1", leads: "1", outbox: "1" });
  });

  it("deduplicates concurrent submissions by normalized phone and preserves one current revision", {
    skip: !databaseConfigured,
    timeout: 60_000,
  }, async () => {
    const phone = uniquePhone();
    const commands = Array.from({ length: 8 }, (_, index) =>
      command({
        idempotencyKey: `crm-concurrent-${index}-${randomUUID()}`,
        pii: {
          name: `Concurrent ${index}`,
          phone: index % 2 === 0 ? phone : phone.replace("+98", "0"),
          email: `concurrent-${index}@example.test`,
        },
      }),
    );
    const results = await Promise.all(commands.map((entry) => ingestAcademyLead(entry)));
    assert.equal(results.every((entry) => entry.status === "committed"), true);
    const ids = results.flatMap((entry) =>
      entry.status === "committed" ? [entry.result.id] : [],
    );
    assert.equal(new Set(ids).size, 1);
    const leadId = ids[0]!;

    const row = await pool!.query<{
      revision: number;
      pii_ciphertext: string;
      pii_iv: string;
      pii_tag: string;
      pii_key_version: number;
      pending: string;
      terminal: string;
      commands: string;
    }>(
      `SELECT lead.revision, lead.pii_ciphertext, lead.pii_iv, lead.pii_tag,
              lead.pii_key_version,
              (SELECT COUNT(*)::text FROM crm_lead_delivery_outbox o
                WHERE o.lead_id = lead.id AND o.status = 'pending') AS pending,
              (SELECT COUNT(*)::text FROM crm_lead_delivery_outbox o
                WHERE o.lead_id = lead.id AND o.status = 'terminal') AS terminal,
              (SELECT COUNT(*)::text FROM crm_lead_commands c
                WHERE c.lead_id = lead.id) AS commands
         FROM crm_leads lead
        WHERE lead.id = $1::uuid`,
      [leadId],
    );
    assert.equal(row.rows[0]?.revision, 8);
    assert.equal(row.rows[0]?.pending, "1");
    assert.equal(row.rows[0]?.terminal, "7");
    assert.equal(row.rows[0]?.commands, "8");
    assert.equal(row.rows[0]?.pii_ciphertext.includes("Concurrent"), false);
    const pii = decryptLeadPii(
      {
        ciphertext: row.rows[0]!.pii_ciphertext,
        iv: row.rows[0]!.pii_iv,
        tag: row.rows[0]!.pii_tag,
        keyVersion: row.rows[0]!.pii_key_version,
      },
      { tenantId: PLATFORM.DEFAULT_TENANT_ID, leadId },
    );
    assert.equal(pii.phone, phone);
  });

  it("signs and delivers only the leased current revision", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const created = await ingestAcademyLead(command());
    assert.equal(created.status, "committed");
    if (created.status !== "committed") return;

    const workerId = `crm-worker-${randomUUID()}`;
    const claims = await inTransaction((client) =>
      claimCrmLeadDeliveries(client, workerId, 100),
    );
    const claim = claims.find((entry) => entry.lead_id === created.result.id);
    assert.ok(claim);

    process.env.ACADEMY_LEADS_WEBHOOK_URL = "https://crm.example.test/academy-leads";
    process.env.TECPEY_CRM_WEBHOOK_SECRET = "crm-postgres-test-webhook-secret-32-minimum";
    let requestBody = "";
    let requestHeaders: Headers | undefined;
    globalThis.fetch = async (_input, init) => {
      requestBody = String(init?.body ?? "");
      requestHeaders = new Headers(init?.headers);
      return new Response(null, { status: 204 });
    };

    await deliverCrmLeadClaim(claim, workerId);
    assert.ok(requestHeaders);
    const timestamp = requestHeaders.get("X-TecPey-Timestamp");
    const signature = requestHeaders.get("X-TecPey-Signature");
    assert.ok(timestamp);
    assert.equal(
      signature,
      `v1=${createHmac("sha256", process.env.TECPEY_CRM_WEBHOOK_SECRET!)
        .update(`${timestamp}.${requestBody}`)
        .digest("hex")}`,
    );
    assert.equal(requestHeaders.get("Idempotency-Key"), claim.id);
    assert.equal(JSON.parse(requestBody).leadId, created.result.id);

    const state = await pool!.query<{ status: string; successes: string }>(
      `SELECT status,
              (SELECT COUNT(*)::text FROM crm_lead_audit_events
                WHERE lead_id = $1::uuid AND action = 'delivery_succeeded') AS successes
         FROM crm_lead_delivery_outbox
        WHERE id = $2::uuid`,
      [created.result.id, claim.id],
    );
    assert.deepEqual(state.rows[0], { status: "delivered", successes: "1" });
  });

  it("does not deliver a claimed revision after a newer revision commits", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const initial = command();
    const first = await ingestAcademyLead(initial);
    assert.equal(first.status, "committed");
    if (first.status !== "committed") return;

    const workerId = `crm-stale-${randomUUID()}`;
    const claims = await inTransaction((client) =>
      claimCrmLeadDeliveries(client, workerId, 100),
    );
    const staleClaim = claims.find((entry) => entry.lead_id === first.result.id);
    assert.ok(staleClaim);

    const updated = await ingestAcademyLead({
      ...initial,
      idempotencyKey: `crm-update-${randomUUID()}`,
      pii: { ...initial.pii, email: `new-${randomUUID()}@example.test` },
    });
    assert.equal(updated.status, "committed");
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(null, { status: 204 });
    };
    await deliverCrmLeadClaim(staleClaim, workerId);
    assert.equal(calls, 0);

    const staleState = await pool!.query<{ status: string; last_error_code: string }>(
      "SELECT status, last_error_code FROM crm_lead_delivery_outbox WHERE id = $1::uuid",
      [staleClaim.id],
    );
    assert.deepEqual(staleState.rows[0], {
      status: "terminal",
      last_error_code: "lease_lost_or_superseded",
    });
  });

  it("exports and privacy-deletes PII with append-only audit evidence", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const source = command();
    const created = await ingestAcademyLead(source);
    assert.equal(created.status, "committed");
    if (created.status !== "committed") return;

    const exported = await exportCrmLeadData({
      tenantId: source.tenantId,
      leadId: created.result.id,
      actorId: "privacy-admin-test",
    });
    assert.equal(exported?.pii.name, source.pii.name);
    assert.equal(exported?.pii.phone, source.pii.phone);

    assert.equal(
      await deleteCrmLeadData({
        tenantId: source.tenantId,
        leadId: created.result.id,
        actorId: "privacy-admin-test",
      }),
      true,
    );
    assert.equal(
      await exportCrmLeadData({
        tenantId: source.tenantId,
        leadId: created.result.id,
        actorId: "privacy-admin-test",
      }),
      null,
    );

    const deleted = await pool!.query<{
      status: string;
      pii_ciphertext: string;
      outbox_status: string;
      exported: string;
      deleted: string;
    }>(
      `SELECT lead.status, lead.pii_ciphertext,
              (SELECT status FROM crm_lead_delivery_outbox
                WHERE lead_id = lead.id ORDER BY created_at DESC LIMIT 1) AS outbox_status,
              (SELECT COUNT(*)::text FROM crm_lead_audit_events
                WHERE lead_id = lead.id AND action = 'exported') AS exported,
              (SELECT COUNT(*)::text FROM crm_lead_audit_events
                WHERE lead_id = lead.id AND action = 'deleted') AS deleted
         FROM crm_leads lead WHERE lead.id = $1::uuid`,
      [created.result.id],
    );
    assert.deepEqual(deleted.rows[0], {
      status: "deleted",
      pii_ciphertext: "",
      outbox_status: "terminal",
      exported: "1",
      deleted: "1",
    });
  });

  it("locks legacy plaintext storage and immutable command evidence", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    await assert.rejects(() =>
      pool!.query(
        "INSERT INTO academy_leads (name, phone, locale, term_number) VALUES ('raw', '09120000000', 'fa', 1)",
      ),
    );

    const created = await ingestAcademyLead(command());
    assert.equal(created.status, "committed");
    if (created.status !== "committed") return;
    await assert.rejects(() =>
      pool!.query(
        "UPDATE crm_lead_commands SET result = '{}'::jsonb WHERE lead_id = $1::uuid",
        [created.result.id],
      ),
    );
    await assert.rejects(() =>
      pool!.query("DELETE FROM crm_leads WHERE id = $1::uuid", [created.result.id]),
    );
  });

  it("returns unavailable and never false success when PostgreSQL is unavailable", () => {
    const script = `
      const module = await import("./src/lib/crm/lead-authority.ts");
      const ingest = module.ingestAcademyLead ?? module.default?.ingestAcademyLead;
      const result = await ingest({
        tenantId: "tecpey",
        idempotencyKey: "crm-unavailable-1234567890",
        leadKind: "academy_interest",
        source: "test",
        locale: "fa",
        pii: { name: "Test User", phone: "+989121234567" },
        attributes: { termNumber: 1 },
        consent: true,
        legalBasis: "consent",
        privacyNoticeVersion: "v1"
      });
      console.log("CRM_RESULT=" + JSON.stringify(result));
    `;
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: "",
          TECPEY_CRM_PII_KEY_B64: Buffer.alloc(32, 3).toString("base64"),
          TECPEY_CRM_CONTACT_HASH_SECRET: "crm-unavailable-contact-hash-secret-32-min",
        },
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    assert.equal(child.status, 0, child.stderr);
    const line = child.stdout
      .split(/\r?\n/)
      .find((entry) => entry.startsWith("CRM_RESULT="));
    assert.ok(line, child.stdout);
    assert.deepEqual(JSON.parse(line.slice("CRM_RESULT=".length)), {
      status: "unavailable",
    });
  });
});
