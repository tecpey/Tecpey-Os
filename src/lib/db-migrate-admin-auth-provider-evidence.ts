import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0075_admin_auth_provider_evidence.sql";

export const ADMIN_AUTH_PROVIDER_EVIDENCE_SQL = `
CREATE TABLE IF NOT EXISTS admin_auth_provider_evidence (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  gate_id TEXT NOT NULL,
  evidence_state TEXT NOT NULL DEFAULT 'missing',
  evidence_ref TEXT,
  evidence_sha256 TEXT,
  decision_note TEXT,
  reviewed_by_admin_id UUID REFERENCES admin_users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, workspace_id, provider_id, gate_id),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces (tenant_id, id) ON DELETE RESTRICT,
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (provider_id IN ('google', 'apple', 'telegram', 'email_otp')),
  CHECK (gate_id IN (
    'client_registered',
    'redirect_uri_allowlisted',
    'secret_stored_server_side',
    'domain_verified',
    'account_linking_policy',
    'audit_rotation_policy'
  )),
  CHECK (evidence_state IN ('missing', 'ready', 'rejected', 'expired')),
  CHECK (evidence_ref IS NULL OR evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,255}$'),
  CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (decision_note IS NULL OR (
    length(decision_note) BETWEEN 3 AND 500
    AND decision_note !~ '[[:cntrl:]]'
  )),
  CHECK (
    evidence_state <> 'ready'
    OR (
      evidence_ref IS NOT NULL
      AND evidence_sha256 IS NOT NULL
      AND reviewed_by_admin_id IS NOT NULL
      AND reviewed_at IS NOT NULL
    )
  ),
  CHECK (expires_at IS NULL OR reviewed_at IS NULL OR expires_at > reviewed_at)
);

CREATE INDEX IF NOT EXISTS admin_auth_provider_evidence_scope_idx
  ON admin_auth_provider_evidence (tenant_id, workspace_id, provider_id, evidence_state);

CREATE INDEX IF NOT EXISTS admin_auth_provider_evidence_expiry_idx
  ON admin_auth_provider_evidence (tenant_id, workspace_id, expires_at)
  WHERE evidence_state = 'ready' AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_auth_provider_evidence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  gate_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  request_hash TEXT NOT NULL,
  evidence_state TEXT NOT NULL,
  evidence_ref TEXT,
  evidence_sha256 TEXT,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces (tenant_id, id) ON DELETE RESTRICT,
  CHECK (tenant_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (workspace_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  CHECK (provider_id IN ('google', 'apple', 'telegram', 'email_otp')),
  CHECK (gate_id IN (
    'client_registered',
    'redirect_uri_allowlisted',
    'secret_stored_server_side',
    'domain_verified',
    'account_linking_policy',
    'audit_rotation_policy'
  )),
  CHECK (action IN ('mark_missing', 'mark_ready', 'reject', 'expire')),
  CHECK (evidence_state IN ('missing', 'ready', 'rejected', 'expired')),
  CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CHECK (evidence_ref IS NULL OR evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,255}$'),
  CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (decision_note IS NULL OR (
    length(decision_note) BETWEEN 3 AND 500
    AND decision_note !~ '[[:cntrl:]]'
  ))
);

CREATE INDEX IF NOT EXISTS admin_auth_provider_evidence_events_scope_idx
  ON admin_auth_provider_evidence_events (tenant_id, workspace_id, provider_id, gate_id, created_at DESC);

CREATE OR REPLACE FUNCTION tecpey_reject_admin_auth_provider_evidence_event_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin auth provider evidence events are append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS admin_auth_provider_evidence_events_no_update
  ON admin_auth_provider_evidence_events;
CREATE TRIGGER admin_auth_provider_evidence_events_no_update
  BEFORE UPDATE ON admin_auth_provider_evidence_events
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_reject_admin_auth_provider_evidence_event_change();

DROP TRIGGER IF EXISTS admin_auth_provider_evidence_events_no_delete
  ON admin_auth_provider_evidence_events;
CREATE TRIGGER admin_auth_provider_evidence_events_no_delete
  BEFORE DELETE ON admin_auth_provider_evidence_events
  FOR EACH ROW
  EXECUTE FUNCTION tecpey_reject_admin_auth_provider_evidence_event_change();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAdminAuthProviderEvidenceMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ADMIN_AUTH_PROVIDER_EVIDENCE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-admin-auth-provider-evidence] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-admin-auth-provider-evidence] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(ADMIN_AUTH_PROVIDER_EVIDENCE_SQL);
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
