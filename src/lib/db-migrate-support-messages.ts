import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0097_support_messages.sql";

// SB-013 — the contact surface collects a name, a contact detail, a subject and
// a message body, and then discards all four: the control labelled "send" is a
// mailto link that opens an empty draft. This table is where those messages go
// instead.
//
// It is deliberately NOT crm_leads. That table dedups on
// (tenant_id, lead_kind, contact_hash) and updates the matching row, which is
// right for a lead — one person, one lead, latest details win — and wrong for a
// message: routed through it, a person's second message would overwrite their
// first, which is the defect SB-013 describes wearing different clothes. Its
// contact_hash is also derived from the phone, so every email-only sender would
// collide into a single row.
//
// What it does reuse is the governance built around crm_leads: the same
// envelope-encrypted PII column, hashed contacts so a sender can be found
// without decrypting anything, the same consent and legal-basis columns, and a
// retain_until the existing retention sweep can act on.
export const SUPPORT_MESSAGES_SQL = `
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  source TEXT NOT NULL,
  pii_ciphertext TEXT NOT NULL,
  pii_iv TEXT NOT NULL,
  pii_tag TEXT NOT NULL,
  pii_key_version INTEGER NOT NULL DEFAULT 1 CHECK (pii_key_version > 0),
  contact_hash TEXT,
  email_hash TEXT,
  phone_hash TEXT,
  network_fingerprint TEXT,
  consent BOOLEAN NOT NULL CHECK (consent = TRUE),
  legal_basis TEXT NOT NULL CHECK (legal_basis IN ('consent', 'pre_contract')),
  privacy_notice_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  retain_until TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(btrim(tenant_id)) > 0),
  CHECK (
    status = 'deleted'
    OR (contact_hash IS NOT NULL AND length(btrim(contact_hash)) > 0)
  ),
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
);

-- Replay protection that does not deduplicate the sender. Two different
-- messages from one person are two rows; the same message submitted twice — a
-- double click, a retried request — is one.
--
-- request_hash is what makes the key honest. A response lost after the insert
-- commits leaves the browser holding the same key; if the sender edits their
-- message and retries, matching on the key alone would hand back the old row as
-- a success and the edit would vanish — the disappearing message again. The
-- hash lets that case be told apart and refused.
CREATE UNIQUE INDEX IF NOT EXISTS support_messages_tenant_idempotency_key
  ON support_messages (tenant_id, idempotency_key);

-- Reading a tenant's queue, and finding a sender's history, without decrypting
-- anything.
CREATE INDEX IF NOT EXISTS support_messages_tenant_created
  ON support_messages (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_messages_tenant_contact
  ON support_messages (tenant_id, contact_hash);

-- The retention sweep selects on this column; without an index it degrades into
-- a sequential scan of the whole table as the table grows.
CREATE INDEX IF NOT EXISTS support_messages_retention
  ON support_messages (retain_until)
  WHERE status = 'active';
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runSupportMessagesMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(SUPPORT_MESSAGES_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-support-messages] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-support-messages] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(SUPPORT_MESSAGES_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [
      FILENAME,
      cs,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
