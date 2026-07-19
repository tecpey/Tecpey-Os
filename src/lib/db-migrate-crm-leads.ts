import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { encryptLeadPii, hashLeadValue, leadContactHash, normalizeLeadPhone } from "./crm/lead-pii";
import { logger } from "./logger";
import { PLATFORM } from "./platform-config";

const FILENAME = "0025_crm_lead_authority.sql";

export const CRM_LEAD_AUTHORITY_SQL = `
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE RESTRICT,
  lead_kind TEXT NOT NULL CHECK (lead_kind IN ('academy_interest', 'academy_specialized')),
  source TEXT NOT NULL,
  campaign TEXT,
  contact_hash CHAR(64) NOT NULL,
  phone_hash CHAR(64) NOT NULL,
  email_hash CHAR(64),
  pii_ciphertext TEXT NOT NULL,
  pii_iv TEXT NOT NULL,
  pii_tag TEXT NOT NULL,
  pii_key_version SMALLINT NOT NULL DEFAULT 1,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  consent_status BOOLEAN NOT NULL CHECK (consent_status = TRUE),
  legal_basis TEXT NOT NULL CHECK (legal_basis IN ('consent', 'pre_contract')),
  privacy_notice_version TEXT NOT NULL,
  retention_class TEXT NOT NULL DEFAULT 'academy_lead_24m'
    CHECK (retention_class IN ('academy_lead_12m', 'academy_lead_24m')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  retain_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (char_length(source) BETWEEN 2 AND 120),
  CHECK (campaign IS NULL OR char_length(campaign) BETWEEN 1 AND 120),
  CHECK (contact_hash ~ '^[0-9a-f]{64}$'),
  CHECK (phone_hash ~ '^[0-9a-f]{64}$'),
  CHECK (email_hash IS NULL OR email_hash ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(attributes) = 'object'),
  CHECK (char_length(privacy_notice_version) BETWEEN 1 AND 80),
  CHECK (retain_until > created_at),
  CHECK (
    (status = 'active' AND deleted_at IS NULL)
    OR (status = 'deleted' AND deleted_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_active_contact_unique_idx
  ON crm_leads (tenant_id, lead_kind, contact_hash)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS crm_leads_retention_idx
  ON crm_leads (retain_until)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS crm_leads_source_idx
  ON crm_leads (tenant_id, source, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_lead_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE RESTRICT,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(result) = 'object')
);
CREATE INDEX IF NOT EXISTS crm_lead_commands_lead_idx
  ON crm_lead_commands (tenant_id, lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_lead_delivery_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE RESTRICT,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE RESTRICT,
  lead_revision INTEGER NOT NULL CHECK (lead_revision > 0),
  destination TEXT NOT NULL CHECK (destination IN ('academy_webhook')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retryable', 'delivered', 'terminal')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  lease_expires_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, lead_revision, destination),
  CHECK (last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 100),
  CHECK (
    (status = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR
    (status = 'delivered' AND delivered_at IS NOT NULL AND locked_at IS NULL AND locked_by IS NULL AND lease_expires_at IS NULL)
    OR
    (status IN ('pending', 'retryable', 'terminal') AND locked_at IS NULL AND locked_by IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS crm_lead_delivery_claim_idx
  ON crm_lead_delivery_outbox (status, available_at, created_at)
  WHERE status IN ('pending', 'retryable');
CREATE INDEX IF NOT EXISTS crm_lead_delivery_lease_idx
  ON crm_lead_delivery_outbox (lease_expires_at)
  WHERE status = 'processing';

CREATE TABLE IF NOT EXISTS crm_lead_audit_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE RESTRICT,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN (
    'created', 'updated', 'delivery_claimed', 'delivery_succeeded',
    'delivery_failed', 'exported', 'deleted', 'retention_deleted'
  )),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('public', 'worker', 'admin', 'retention')),
  actor_id TEXT,
  network_fingerprint CHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (network_fingerprint IS NULL OR network_fingerprint ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS crm_lead_audit_lead_idx
  ON crm_lead_audit_events (tenant_id, lead_id, created_at DESC);

CREATE OR REPLACE FUNCTION tecpey_block_crm_lead_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'crm_lead_audit_events is append-only' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS crm_lead_audit_no_update ON crm_lead_audit_events;
CREATE TRIGGER crm_lead_audit_no_update
  BEFORE UPDATE ON crm_lead_audit_events
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_crm_lead_audit_mutation();
DROP TRIGGER IF EXISTS crm_lead_audit_no_delete ON crm_lead_audit_events;
CREATE TRIGGER crm_lead_audit_no_delete
  BEFORE DELETE ON crm_lead_audit_events
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_crm_lead_audit_mutation();
`;

const LEGACY_ACADEMY_LEADS_LOCK_SQL = `
CREATE OR REPLACE FUNCTION tecpey_block_legacy_academy_leads_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'academy_leads is legacy read-only; use crm_leads authority'
    USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS academy_leads_legacy_read_only ON academy_leads;
CREATE TRIGGER academy_leads_legacy_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON academy_leads
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_legacy_academy_leads_write();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

async function migrateLegacyAcademyLeads(client: PoolClient): Promise<void> {
  const legacy = await client.query<{
    id: string;
    name: string;
    phone: string;
    locale: string;
    term_number: number;
    created_at: Date;
  }>(
    `SELECT id::text, name, phone, locale, term_number, created_at
       FROM academy_leads
      WHERE name <> '[migrated-redacted]' OR phone <> '[redacted]'
      ORDER BY id`,
  );

  for (const row of legacy.rows) {
    const phone = normalizeLeadPhone(row.phone);
    const contactHash = leadContactHash(phone);
    const provisionalLeadId = randomUUID();
    const encrypted = encryptLeadPii(
      { name: row.name, phone },
      { tenantId: PLATFORM.DEFAULT_TENANT_ID, leadId: provisionalLeadId },
    );
    const upserted = await client.query<{ id: string; revision: number; created: boolean }>(
      `INSERT INTO crm_leads
        (id, tenant_id, lead_kind, source, contact_hash, phone_hash,
         pii_ciphertext, pii_iv, pii_tag, pii_key_version, attributes,
         locale, consent_status, legal_basis, privacy_notice_version,
         retention_class, revision, retain_until, created_at, updated_at)
       VALUES
        ($1::uuid, $2, 'academy_interest', 'legacy-academy-leads', $3, $4,
         $5, $6, $7, $8, $9::jsonb, $10, TRUE, 'pre_contract',
         'legacy-migration-v1', 'academy_lead_12m', 1,
         GREATEST($11::timestamptz + INTERVAL '12 months', NOW() + INTERVAL '30 days'),
         $11::timestamptz, NOW())
       ON CONFLICT (tenant_id, lead_kind, contact_hash) WHERE status = 'active'
       DO UPDATE SET
         revision = crm_leads.revision + 1,
         updated_at = NOW(),
         retain_until = GREATEST(crm_leads.retain_until, NOW() + INTERVAL '30 days')
       RETURNING id, revision, (xmax = 0) AS created`,
      [
        provisionalLeadId,
        PLATFORM.DEFAULT_TENANT_ID,
        contactHash,
        hashLeadValue(phone),
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        encrypted.keyVersion,
        JSON.stringify({ termNumber: row.term_number, legacyLeadId: row.id }),
        row.locale === "en" ? "en" : "fa",
        row.created_at,
      ],
    );
    const lead = upserted.rows[0];
    if (!lead) throw new Error("crm_legacy_lead_migration_failed");
    const idempotencyKey = `legacy-academy-lead-${row.id}`;
    const requestHash = createHash("sha256")
      .update(`${row.id}:${contactHash}:${row.created_at.toISOString()}`)
      .digest("hex");
    const result = { id: lead.id, created: lead.created, replayed: false, revision: lead.revision };
    await client.query(
      `INSERT INTO crm_lead_commands
        (tenant_id, idempotency_key, request_hash, lead_id, result)
       VALUES ($1, $2, $3, $4::uuid, $5::jsonb)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
      [PLATFORM.DEFAULT_TENANT_ID, idempotencyKey, requestHash, lead.id, JSON.stringify(result)],
    );
    await client.query(
      `INSERT INTO crm_lead_delivery_outbox
        (tenant_id, lead_id, lead_revision, destination)
       VALUES ($1, $2::uuid, $3, 'academy_webhook')
       ON CONFLICT (lead_id, lead_revision, destination) DO NOTHING`,
      [PLATFORM.DEFAULT_TENANT_ID, lead.id, lead.revision],
    );
    await client.query(
      `INSERT INTO crm_lead_audit_events
        (tenant_id, lead_id, action, actor_type, metadata)
       VALUES ($1, $2::uuid, $3, 'retention', $4::jsonb)`,
      [
        PLATFORM.DEFAULT_TENANT_ID,
        lead.id,
        lead.created ? "created" : "updated",
        JSON.stringify({ migratedFrom: "academy_leads", legacyLeadId: row.id }),
      ],
    );
  }

  await client.query(
    `UPDATE academy_leads
        SET name = '[migrated-redacted]',
            phone = '[redacted]',
            ip = NULL,
            user_agent = NULL
      WHERE name <> '[migrated-redacted]' OR phone <> '[redacted]'`,
  );
  await client.query(LEGACY_ACADEMY_LEADS_LOCK_SQL);
}

export async function runCrmLeadMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(`${CRM_LEAD_AUTHORITY_SQL}\n${LEGACY_ACADEMY_LEADS_LOCK_SQL}`);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-crm-leads] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-crm-leads] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(CRM_LEAD_AUTHORITY_SQL);
    await migrateLegacyAcademyLeads(client);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
