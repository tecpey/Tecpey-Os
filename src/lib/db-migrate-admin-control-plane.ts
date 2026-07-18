import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0018_admin_control_plane_foundation.sql";

export const ADMIN_CONTROL_PLANE_SQL = `
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'suspended', 'disabled')),
  permission_version INTEGER NOT NULL DEFAULT 1,
  mfa_enrolled_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_unique_idx
  ON admin_users (LOWER(email));
CREATE INDEX IF NOT EXISTS admin_users_status_idx
  ON admin_users (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS admin_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_permissions (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  risk_level TEXT NOT NULL DEFAULT 'standard'
    CHECK (risk_level IN ('standard', 'sensitive', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id TEXT NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES admin_permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS admin_user_roles (
  admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES admin_roles(id) ON DELETE RESTRICT,
  assigned_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  reason TEXT,
  PRIMARY KEY (admin_id, role_id, assigned_at)
);

CREATE INDEX IF NOT EXISTS admin_user_roles_active_idx
  ON admin_user_roles (admin_id, role_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  jti TEXT NOT NULL UNIQUE,
  permission_version INTEGER NOT NULL,
  authentication_methods JSONB NOT NULL DEFAULT '[]'::jsonb,
  ip TEXT,
  user_agent TEXT,
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  step_up_at TIMESTAMPTZ,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  revoked_reason TEXT
);

CREATE INDEX IF NOT EXISTS admin_sessions_active_admin_idx
  ON admin_sessions (admin_id, absolute_expires_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx
  ON admin_sessions (idle_expires_at, absolute_expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports JSONB NOT NULL DEFAULT '[]'::jsonb,
  device_type TEXT,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS admin_webauthn_credentials_admin_idx
  ON admin_webauthn_credentials (admin_id, created_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled', 'executed')),
  requested_by UUID NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  reviewed_by UUID REFERENCES admin_users(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  CHECK (reviewed_by IS NULL OR reviewed_by <> requested_by)
);

CREATE INDEX IF NOT EXISTS admin_approval_requests_queue_idx
  ON admin_approval_requests (status, expires_at, requested_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES admin_sessions(id) ON DELETE SET NULL,
  effective_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  request_id TEXT,
  source_ip TEXT,
  user_agent TEXT,
  reason TEXT,
  before_state JSONB,
  after_state JSONB,
  approval_request_id UUID REFERENCES admin_approval_requests(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL DEFAULT 'success'
    CHECK (outcome IN ('success', 'denied', 'failed')),
  error_code TEXT,
  previous_hash TEXT,
  event_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_events_actor_idx
  ON admin_audit_events (actor_admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_events_resource_idx
  ON admin_audit_events (resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_events_action_idx
  ON admin_audit_events (action, created_at DESC);

INSERT INTO admin_roles (id, name, description) VALUES
  ('super_admin', 'Super Administrator', 'Full control-plane authority with step-up requirements'),
  ('security_admin', 'Security Administrator', 'Security, sessions, incidents and access governance'),
  ('compliance_analyst', 'Compliance Analyst', 'KYC, AML, sanctions and risk-case analysis'),
  ('compliance_approver', 'Compliance Approver', 'Independent compliance approval authority'),
  ('treasury_operator', 'Treasury Operator', 'Wallet and withdrawal operations without sole approval authority'),
  ('treasury_approver', 'Treasury Approver', 'Independent treasury approval authority'),
  ('exchange_ops', 'Exchange Operations', 'Markets, fees, limits, orders and trade operations'),
  ('academy_admin', 'Academy Administrator', 'Academy content, progress and certification operations'),
  ('support_agent', 'Support Agent', 'Permission-limited user support'),
  ('marketing_operator', 'Marketing Operator', 'Campaign preview and scheduling'),
  ('auditor', 'Auditor', 'Read-only audit and compliance visibility'),
  ('incident_commander', 'Incident Commander', 'Emergency incident coordination and containment')
ON CONFLICT (id) DO NOTHING;

INSERT INTO admin_permissions (id, description, risk_level) VALUES
  ('*', 'All permissions; restricted to super administrators', 'critical'),
  ('admin.identities.read', 'Read administrator identities and assignments', 'sensitive'),
  ('admin.identities.manage', 'Create, suspend or modify administrator identities', 'critical'),
  ('admin.roles.read', 'Read role and permission definitions', 'sensitive'),
  ('admin.roles.manage', 'Assign or modify roles and permissions', 'critical'),
  ('users.read', 'Read user account data', 'sensitive'),
  ('users.suspend', 'Suspend a user account', 'critical'),
  ('users.recover', 'Override or recover user identity access', 'critical'),
  ('kyc.review', 'Review KYC/KYB evidence', 'sensitive'),
  ('kyc.approve', 'Approve or override identity verification', 'critical'),
  ('aml.case.read', 'Read AML and sanctions cases', 'sensitive'),
  ('aml.case.manage', 'Assign, update or close AML cases', 'critical'),
  ('withdrawals.read', 'Read withdrawal records', 'sensitive'),
  ('withdrawals.hold', 'Place a withdrawal on hold', 'critical'),
  ('withdrawals.approve', 'Approve a withdrawal', 'critical'),
  ('withdrawals.reject', 'Reject a withdrawal', 'critical'),
  ('wallets.read', 'Read wallet and signer status', 'sensitive'),
  ('wallets.policy.manage', 'Change wallet limits or signer policy', 'critical'),
  ('ledger.read', 'Read ledger and reconciliation data', 'sensitive'),
  ('ledger.adjust.request', 'Request a ledger adjustment', 'critical'),
  ('ledger.adjust.approve', 'Approve a ledger adjustment', 'critical'),
  ('exchange.read', 'Read exchange operations data', 'sensitive'),
  ('exchange.manage', 'Change markets, fees or operational limits', 'critical'),
  ('academy.read', 'Read Academy administration data', 'standard'),
  ('academy.content.manage', 'Edit Academy content and assessments', 'sensitive'),
  ('academy.content.publish', 'Publish Academy content', 'critical'),
  ('academy.progress.correct', 'Correct learner progress with reason', 'critical'),
  ('mentor.read', 'Read Mentor policy and safety metadata', 'sensitive'),
  ('mentor.policy.manage', 'Change Mentor providers, policies or prompt versions', 'critical'),
  ('mentor.memory.inspect', 'Inspect authorized Mentor memory', 'critical'),
  ('arena.read', 'Read Trading Arena operations data', 'sensitive'),
  ('arena.manage', 'Manage plans, attempts and integrity controls', 'critical'),
  ('campaign.preview', 'Preview campaign audiences and content', 'standard'),
  ('campaign.schedule', 'Schedule a campaign', 'sensitive'),
  ('campaign.approve', 'Approve a broad campaign', 'critical'),
  ('security.sessions.read', 'Read administrator and user sessions', 'sensitive'),
  ('security.sessions.revoke', 'Revoke sessions', 'critical'),
  ('security.incident.manage', 'Activate and manage incident controls', 'critical'),
  ('system.health.read', 'Read system health and operational status', 'standard'),
  ('audit.read', 'Read immutable audit events', 'sensitive'),
  ('audit.export', 'Export audit and compliance evidence', 'critical')
ON CONFLICT (id) DO NOTHING;

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT 'super_admin', id FROM admin_permissions
ON CONFLICT DO NOTHING;

INSERT INTO admin_role_permissions (role_id, permission_id) VALUES
  ('security_admin', 'admin.identities.read'),
  ('security_admin', 'admin.roles.read'),
  ('security_admin', 'security.sessions.read'),
  ('security_admin', 'security.sessions.revoke'),
  ('security_admin', 'security.incident.manage'),
  ('security_admin', 'audit.read'),
  ('compliance_analyst', 'users.read'),
  ('compliance_analyst', 'kyc.review'),
  ('compliance_analyst', 'aml.case.read'),
  ('compliance_analyst', 'aml.case.manage'),
  ('compliance_approver', 'users.read'),
  ('compliance_approver', 'kyc.review'),
  ('compliance_approver', 'kyc.approve'),
  ('compliance_approver', 'aml.case.read'),
  ('treasury_operator', 'withdrawals.read'),
  ('treasury_operator', 'withdrawals.hold'),
  ('treasury_operator', 'wallets.read'),
  ('treasury_operator', 'ledger.read'),
  ('treasury_operator', 'ledger.adjust.request'),
  ('treasury_approver', 'withdrawals.read'),
  ('treasury_approver', 'withdrawals.approve'),
  ('treasury_approver', 'withdrawals.reject'),
  ('treasury_approver', 'wallets.read'),
  ('treasury_approver', 'ledger.read'),
  ('treasury_approver', 'ledger.adjust.approve'),
  ('exchange_ops', 'exchange.read'),
  ('exchange_ops', 'exchange.manage'),
  ('academy_admin', 'academy.read'),
  ('academy_admin', 'academy.content.manage'),
  ('academy_admin', 'academy.content.publish'),
  ('academy_admin', 'academy.progress.correct'),
  ('support_agent', 'users.read'),
  ('marketing_operator', 'campaign.preview'),
  ('marketing_operator', 'campaign.schedule'),
  ('auditor', 'audit.read'),
  ('auditor', 'system.health.read'),
  ('incident_commander', 'security.sessions.read'),
  ('incident_commander', 'security.sessions.revoke'),
  ('incident_commander', 'security.incident.manage'),
  ('incident_commander', 'system.health.read'),
  ('incident_commander', 'audit.read')
ON CONFLICT DO NOTHING;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runAdminControlPlaneMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ADMIN_CONTROL_PLANE_SQL);
  const applied = await client.query<{ checksum: string }>(
    `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`,
    [FILENAME],
  );

  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-admin] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-admin] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(ADMIN_CONTROL_PLANE_SQL);
    await client.query(
      `INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`,
      [FILENAME, cs],
    );
    await client.query("COMMIT");
    logger.info("[db-migrate-admin] migration applied", { filename: FILENAME });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
