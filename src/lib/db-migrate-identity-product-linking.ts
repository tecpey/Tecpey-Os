import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0099_identity_product_linking_authority.sql";

export const IDENTITY_PRODUCT_LINKING_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS platform_product_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  principal_id UUID NOT NULL,
  product TEXT NOT NULL CHECK (product IN ('academy', 'exchange')),
  product_account_ref_hash TEXT NOT NULL,
  fingerprint_key_version SMALLINT NOT NULL DEFAULT 1
    CHECK (fingerprint_key_version BETWEEN 1 AND 32767),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'disputed', 'closed')),
  binding_source TEXT NOT NULL
    CHECK (binding_source IN ('native', 'account_linking', 'recovery_review')),
  bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product, product_account_ref_hash),
  CONSTRAINT platform_product_accounts_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE RESTRICT,
  CONSTRAINT platform_product_accounts_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES platform_principals(tenant_id, id) ON DELETE RESTRICT,
  CHECK (product_account_ref_hash ~ '^[0-9a-f]{64}$'),
  CHECK (char_length(binding_source) BETWEEN 3 AND 40)
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_product_accounts_one_live_product_idx
  ON platform_product_accounts (tenant_id, principal_id, product)
  WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS platform_product_accounts_principal_idx
  ON platform_product_accounts (tenant_id, principal_id, product, status, bound_at DESC);

CREATE OR REPLACE FUNCTION tecpey_guard_product_account_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
     OR NEW.product IS DISTINCT FROM OLD.product
     OR NEW.product_account_ref_hash IS DISTINCT FROM OLD.product_account_ref_hash
     OR NEW.fingerprint_key_version IS DISTINCT FROM OLD.fingerprint_key_version
     OR NEW.binding_source IS DISTINCT FROM OLD.binding_source
     OR NEW.bound_at IS DISTINCT FROM OLD.bound_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'platform product-account identity is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
    RAISE EXCEPTION 'closed product account cannot be reopened automatically'
      USING ERRCODE = '55000';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_product_accounts_identity_guard ON platform_product_accounts;
CREATE TRIGGER platform_product_accounts_identity_guard
BEFORE UPDATE ON platform_product_accounts
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_product_account_identity();

CREATE OR REPLACE FUNCTION tecpey_block_product_account_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform product-account bindings are retained; close instead of delete'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS platform_product_accounts_no_delete ON platform_product_accounts;
CREATE TRIGGER platform_product_accounts_no_delete
BEFORE DELETE ON platform_product_accounts
FOR EACH ROW EXECUTE FUNCTION tecpey_block_product_account_delete();

CREATE TABLE IF NOT EXISTS product_account_link_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  principal_id UUID NOT NULL,
  source_product_account_id UUID NOT NULL,
  source_product TEXT NOT NULL CHECK (source_product IN ('academy', 'exchange')),
  target_product TEXT NOT NULL CHECK (target_product IN ('academy', 'exchange')),
  target_product_account_id UUID,
  target_account_ref_hash TEXT NOT NULL,
  target_fingerprint_key_version SMALLINT NOT NULL DEFAULT 1
    CHECK (target_fingerprint_key_version BETWEEN 1 AND 32767),
  state_hash TEXT NOT NULL,
  proof_challenge_hash TEXT NOT NULL,
  redirect_uri_hash TEXT NOT NULL,
  requested_scopes TEXT[] NOT NULL DEFAULT '{}'::text[],
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'target_verified', 'approved', 'completed', 'rejected', 'cancelled', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  target_verified_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, state_hash),
  CONSTRAINT product_account_link_transactions_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE RESTRICT,
  CONSTRAINT product_account_link_transactions_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES platform_principals(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT product_account_link_transactions_source_account_fk
    FOREIGN KEY (tenant_id, source_product_account_id)
    REFERENCES platform_product_accounts(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT product_account_link_transactions_target_account_fk
    FOREIGN KEY (tenant_id, target_product_account_id)
    REFERENCES platform_product_accounts(tenant_id, id) ON DELETE RESTRICT,
  CHECK (source_product <> target_product),
  CHECK (target_account_ref_hash ~ '^[0-9a-f]{64}$'),
  CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  CHECK (proof_challenge_hash ~ '^[0-9a-f]{64}$'),
  CHECK (redirect_uri_hash ~ '^[0-9a-f]{64}$'),
  CHECK (array_ndims(requested_scopes) IS NULL OR array_ndims(requested_scopes) = 1),
  CHECK (array_position(requested_scopes, NULL) IS NULL),
  CHECK (cardinality(requested_scopes) BETWEEN 0 AND 6),
  CHECK (requested_scopes <@ ARRAY[
    'exchange.profile.summary.read',
    'exchange.kyc.status.read',
    'exchange.portfolio.risk_summary.read',
    'exchange.activity.summary.read',
    'exchange.behavior.risk_signals.read',
    'exchange.performance.summary.read'
  ]::text[]),
  CHECK (expires_at > created_at),
  CHECK (status NOT IN ('target_verified', 'approved', 'completed') OR target_product_account_id IS NOT NULL),
  CHECK (status NOT IN ('target_verified', 'approved', 'completed') OR target_verified_at IS NOT NULL),
  CHECK (status NOT IN ('approved', 'completed') OR approved_at IS NOT NULL),
  CHECK (status <> 'completed' OR consumed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS product_account_link_transactions_principal_idx
  ON product_account_link_transactions (tenant_id, principal_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS product_account_link_transactions_expiry_idx
  ON product_account_link_transactions (expires_at)
  WHERE status IN ('pending', 'target_verified', 'approved');

CREATE OR REPLACE FUNCTION tecpey_validate_product_account_link_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'pending'
     OR NEW.target_product_account_id IS NOT NULL
     OR NEW.target_verified_at IS NOT NULL
     OR NEW.approved_at IS NOT NULL
     OR NEW.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'new product account linking ceremonies must start pending and unconsumed'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM platform_product_accounts source_account
     WHERE source_account.tenant_id = NEW.tenant_id
       AND source_account.id = NEW.source_product_account_id
       AND source_account.principal_id = NEW.principal_id
       AND source_account.product = NEW.source_product
       AND source_account.status = 'active'
  ) THEN
    RAISE EXCEPTION 'linking source account must be active and owned by the principal'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_account_link_transactions_insert_guard ON product_account_link_transactions;
CREATE TRIGGER product_account_link_transactions_insert_guard
BEFORE INSERT ON product_account_link_transactions
FOR EACH ROW EXECUTE FUNCTION tecpey_validate_product_account_link_insert();

CREATE OR REPLACE FUNCTION tecpey_guard_product_account_link_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE transition TEXT;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
     OR NEW.source_product_account_id IS DISTINCT FROM OLD.source_product_account_id
     OR NEW.source_product IS DISTINCT FROM OLD.source_product
     OR NEW.target_product IS DISTINCT FROM OLD.target_product
     OR NEW.target_account_ref_hash IS DISTINCT FROM OLD.target_account_ref_hash
     OR NEW.target_fingerprint_key_version IS DISTINCT FROM OLD.target_fingerprint_key_version
     OR NEW.state_hash IS DISTINCT FROM OLD.state_hash
     OR NEW.proof_challenge_hash IS DISTINCT FROM OLD.proof_challenge_hash
     OR NEW.redirect_uri_hash IS DISTINCT FROM OLD.redirect_uri_hash
     OR NEW.requested_scopes IS DISTINCT FROM OLD.requested_scopes
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'product account linking ceremony identity is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status IN ('completed', 'rejected', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'terminal product account linking ceremony is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status = OLD.status THEN
    IF NEW.target_product_account_id IS DISTINCT FROM OLD.target_product_account_id
       OR NEW.target_verified_at IS DISTINCT FROM OLD.target_verified_at
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN
      RAISE EXCEPTION 'linking ceremony proof/timestamps are transition-controlled'
        USING ERRCODE = '55000';
    END IF;
    NEW.updated_at := OLD.updated_at;
    RETURN NEW;
  END IF;

  IF NOW() >= OLD.expires_at AND NEW.status NOT IN ('expired', 'cancelled') THEN
    RAISE EXCEPTION 'expired product account linking ceremony cannot advance'
      USING ERRCODE = '55000';
  END IF;

  transition := OLD.status || '->' || NEW.status;
  IF transition NOT IN (
    'pending->target_verified', 'pending->rejected', 'pending->cancelled', 'pending->expired',
    'target_verified->approved', 'target_verified->rejected', 'target_verified->cancelled', 'target_verified->expired',
    'approved->completed', 'approved->cancelled', 'approved->expired'
  ) THEN
    RAISE EXCEPTION 'invalid product account linking transition: %', transition
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status = 'target_verified' THEN
    IF NEW.target_product_account_id IS NULL THEN
      RAISE EXCEPTION 'target verification requires an exact target product account'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM platform_product_accounts source_account
       WHERE source_account.tenant_id = NEW.tenant_id
         AND source_account.id = NEW.source_product_account_id
         AND source_account.principal_id = NEW.principal_id
         AND source_account.product = NEW.source_product
         AND source_account.status = 'active'
    ) THEN
      RAISE EXCEPTION 'linking source account must be active and owned by the principal'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM platform_product_accounts target_account
       WHERE target_account.tenant_id = NEW.tenant_id
         AND target_account.id = NEW.target_product_account_id
         AND target_account.principal_id = NEW.principal_id
         AND target_account.product = NEW.target_product
         AND target_account.product_account_ref_hash = NEW.target_account_ref_hash
         AND target_account.fingerprint_key_version = NEW.target_fingerprint_key_version
         AND target_account.status = 'active'
    ) THEN
      RAISE EXCEPTION 'linking target account proof does not match the principal/product/fingerprint tuple'
        USING ERRCODE = '23514';
    END IF;
    NEW.target_verified_at := NOW();
    NEW.approved_at := NULL;
    NEW.consumed_at := NULL;
  ELSE
    IF NEW.target_product_account_id IS DISTINCT FROM OLD.target_product_account_id THEN
      RAISE EXCEPTION 'target product account can only be bound during target verification'
        USING ERRCODE = '55000';
    END IF;
    NEW.target_verified_at := OLD.target_verified_at;
  END IF;

  IF NEW.status = 'approved' THEN
    NEW.approved_at := NOW();
    NEW.consumed_at := NULL;
  ELSIF NEW.status = 'completed' THEN
    IF NOT EXISTS (
      SELECT 1
        FROM platform_product_accounts source_account
        JOIN platform_product_accounts target_account
          ON target_account.tenant_id = source_account.tenant_id
       WHERE source_account.tenant_id = NEW.tenant_id
         AND source_account.id = NEW.source_product_account_id
         AND source_account.principal_id = NEW.principal_id
         AND source_account.product = NEW.source_product
         AND source_account.status = 'active'
         AND target_account.id = NEW.target_product_account_id
         AND target_account.principal_id = NEW.principal_id
         AND target_account.product = NEW.target_product
         AND target_account.product_account_ref_hash = NEW.target_account_ref_hash
         AND target_account.fingerprint_key_version = NEW.target_fingerprint_key_version
         AND target_account.status = 'active'
    ) THEN
      RAISE EXCEPTION 'linking completion requires both exact product accounts to remain active'
        USING ERRCODE = '23514';
    END IF;
    NEW.approved_at := OLD.approved_at;
    NEW.consumed_at := NOW();
  ELSE
    NEW.approved_at := COALESCE(NEW.approved_at, OLD.approved_at);
    NEW.consumed_at := OLD.consumed_at;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_account_link_transactions_transition_guard ON product_account_link_transactions;
CREATE TRIGGER product_account_link_transactions_transition_guard
BEFORE UPDATE ON product_account_link_transactions
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_product_account_link_transition();

CREATE OR REPLACE FUNCTION tecpey_block_product_account_link_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'product account linking ceremonies are retained for audit' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS product_account_link_transactions_no_delete ON product_account_link_transactions;
CREATE TRIGGER product_account_link_transactions_no_delete
BEFORE DELETE ON product_account_link_transactions
FOR EACH ROW EXECUTE FUNCTION tecpey_block_product_account_link_delete();

CREATE TABLE IF NOT EXISTS identity_assurance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence BIGSERIAL NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  principal_id UUID NOT NULL,
  exchange_product_account_id UUID NOT NULL,
  framework TEXT NOT NULL DEFAULT 'openid-identity-assurance',
  provider_subject_ref_hash TEXT,
  provider_fingerprint_key_version SMALLINT
    CHECK (provider_fingerprint_key_version IS NULL OR provider_fingerprint_key_version BETWEEN 1 AND 32767),
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'rejected', 'expired', 'revoked')),
  assurance_level TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  supersedes_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT identity_assurance_records_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE RESTRICT,
  CONSTRAINT identity_assurance_records_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES platform_principals(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT identity_assurance_records_product_account_fk
    FOREIGN KEY (tenant_id, exchange_product_account_id) REFERENCES platform_product_accounts(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT identity_assurance_records_supersedes_fk
    FOREIGN KEY (tenant_id, supersedes_id) REFERENCES identity_assurance_records(tenant_id, id) ON DELETE RESTRICT,
  CHECK (char_length(framework) BETWEEN 3 AND 100),
  CHECK (provider_subject_ref_hash IS NULL OR provider_subject_ref_hash ~ '^[0-9a-f]{64}$'),
  CHECK ((provider_subject_ref_hash IS NULL) = (provider_fingerprint_key_version IS NULL)),
  CHECK (char_length(assurance_level) BETWEEN 1 AND 80),
  CHECK (char_length(jurisdiction) BETWEEN 2 AND 32),
  CHECK (char_length(policy_version) BETWEEN 3 AND 100),
  CHECK (status <> 'verified' OR verified_at IS NOT NULL),
  CHECK (status NOT IN ('revoked', 'expired') OR supersedes_id IS NOT NULL),
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

CREATE INDEX IF NOT EXISTS identity_assurance_records_principal_idx
  ON identity_assurance_records (tenant_id, principal_id, event_sequence DESC);

CREATE OR REPLACE FUNCTION tecpey_validate_identity_assurance_account()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE account_status TEXT;
BEGIN
  SELECT account.status INTO account_status
    FROM platform_product_accounts account
   WHERE account.tenant_id = NEW.tenant_id
     AND account.id = NEW.exchange_product_account_id
     AND account.principal_id = NEW.principal_id
     AND account.product = 'exchange';
  IF account_status IS NULL THEN
    RAISE EXCEPTION 'identity assurance must bind the principal own Exchange product account'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status IN ('pending', 'verified') AND account_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'new or verified identity assurance requires a live Exchange product account'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM identity_assurance_records previous
     WHERE previous.tenant_id = NEW.tenant_id
       AND previous.id = NEW.supersedes_id
       AND previous.principal_id = NEW.principal_id
       AND previous.exchange_product_account_id = NEW.exchange_product_account_id
  ) THEN
    RAISE EXCEPTION 'identity assurance supersession must stay on the same principal and Exchange account'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS identity_assurance_records_account_guard ON identity_assurance_records;
CREATE TRIGGER identity_assurance_records_account_guard
BEFORE INSERT ON identity_assurance_records
FOR EACH ROW EXECUTE FUNCTION tecpey_validate_identity_assurance_account();

CREATE OR REPLACE FUNCTION tecpey_block_identity_assurance_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'identity assurance records are append-only' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS identity_assurance_records_no_update ON identity_assurance_records;
CREATE TRIGGER identity_assurance_records_no_update
BEFORE UPDATE ON identity_assurance_records
FOR EACH ROW EXECUTE FUNCTION tecpey_block_identity_assurance_mutation();
DROP TRIGGER IF EXISTS identity_assurance_records_no_delete ON identity_assurance_records;
CREATE TRIGGER identity_assurance_records_no_delete
BEFORE DELETE ON identity_assurance_records
FOR EACH ROW EXECUTE FUNCTION tecpey_block_identity_assurance_mutation();

CREATE OR REPLACE VIEW identity_current_assurance AS
SELECT DISTINCT ON (tenant_id, principal_id)
  id, event_sequence, tenant_id, principal_id, exchange_product_account_id,
  framework, status, assurance_level, jurisdiction, policy_version,
  verified_at, expires_at, created_at
FROM identity_assurance_records
ORDER BY tenant_id, principal_id, event_sequence DESC;

CREATE OR REPLACE VIEW identity_effective_assurance AS
SELECT assurance.*
FROM identity_current_assurance assurance
JOIN platform_principals principal
  ON principal.tenant_id = assurance.tenant_id AND principal.id = assurance.principal_id
JOIN platform_product_accounts account
  ON account.tenant_id = assurance.tenant_id
 AND account.id = assurance.exchange_product_account_id
 AND account.principal_id = assurance.principal_id
 AND account.product = 'exchange'
WHERE assurance.status = 'verified'
  AND (assurance.expires_at IS NULL OR assurance.expires_at > NOW())
  AND principal.status = 'active'
  AND account.status = 'active';

CREATE TABLE IF NOT EXISTS product_data_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence BIGSERIAL NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  principal_id UUID NOT NULL,
  link_transaction_id UUID NOT NULL,
  exchange_product_account_id UUID NOT NULL,
  receiving_service TEXT NOT NULL CHECK (receiving_service IN ('core', 'mentor')),
  purpose TEXT NOT NULL CHECK (purpose IN ('account_linking', 'mentor_personalization', 'mentor_risk_coaching', 'cross_product_profile')),
  scope TEXT NOT NULL CHECK (scope IN (
    'exchange.profile.summary.read', 'exchange.kyc.status.read',
    'exchange.portfolio.risk_summary.read', 'exchange.activity.summary.read',
    'exchange.behavior.risk_signals.read', 'exchange.performance.summary.read'
  )),
  status TEXT NOT NULL CHECK (status IN ('granted', 'revoked')),
  policy_version TEXT NOT NULL,
  jurisdiction TEXT,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, principal_id, idempotency_key),
  CONSTRAINT product_data_consent_events_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES platform_tenants(id) ON DELETE RESTRICT,
  CONSTRAINT product_data_consent_events_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES platform_principals(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT product_data_consent_events_link_fk
    FOREIGN KEY (tenant_id, link_transaction_id) REFERENCES product_account_link_transactions(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT product_data_consent_events_exchange_account_fk
    FOREIGN KEY (tenant_id, exchange_product_account_id) REFERENCES platform_product_accounts(tenant_id, id) ON DELETE RESTRICT,
  CHECK (
    (receiving_service = 'mentor' AND purpose IN ('mentor_personalization', 'mentor_risk_coaching'))
    OR (receiving_service = 'core' AND purpose IN ('account_linking', 'cross_product_profile'))
  ),
  CHECK (char_length(policy_version) BETWEEN 3 AND 100),
  CHECK (jurisdiction IS NULL OR char_length(jurisdiction) BETWEEN 2 AND 32),
  CHECK (char_length(correlation_id) BETWEEN 8 AND 200),
  CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  CHECK (expires_at IS NULL OR expires_at > occurred_at)
);

CREATE INDEX IF NOT EXISTS product_data_consent_events_principal_idx
  ON product_data_consent_events
    (tenant_id, principal_id, exchange_product_account_id, receiving_service, purpose, scope, event_sequence DESC);

CREATE OR REPLACE FUNCTION tecpey_validate_product_data_consent_link()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE account_status TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM product_account_link_transactions link
     WHERE link.tenant_id = NEW.tenant_id
       AND link.id = NEW.link_transaction_id
       AND link.principal_id = NEW.principal_id
       AND link.status = 'completed'
       AND NEW.scope = ANY(link.requested_scopes)
       AND ((link.source_product = 'exchange' AND link.source_product_account_id = NEW.exchange_product_account_id)
         OR (link.target_product = 'exchange' AND link.target_product_account_id = NEW.exchange_product_account_id))
  ) THEN
    RAISE EXCEPTION 'product data consent requires a completed exact-account link ceremony and requested scope'
      USING ERRCODE = '23514';
  END IF;

  SELECT account.status INTO account_status
    FROM platform_product_accounts account
   WHERE account.tenant_id = NEW.tenant_id
     AND account.id = NEW.exchange_product_account_id
     AND account.principal_id = NEW.principal_id
     AND account.product = 'exchange';
  IF account_status IS NULL THEN
    RAISE EXCEPTION 'product data consent requires the principal Exchange account'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'granted' AND account_status <> 'active' THEN
    RAISE EXCEPTION 'granting product data consent requires an active Exchange account'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_data_consent_events_link_guard ON product_data_consent_events;
CREATE TRIGGER product_data_consent_events_link_guard
BEFORE INSERT ON product_data_consent_events
FOR EACH ROW EXECUTE FUNCTION tecpey_validate_product_data_consent_link();

CREATE OR REPLACE FUNCTION tecpey_block_product_data_consent_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'product data consent events are append-only' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS product_data_consent_events_no_update ON product_data_consent_events;
CREATE TRIGGER product_data_consent_events_no_update
BEFORE UPDATE ON product_data_consent_events
FOR EACH ROW EXECUTE FUNCTION tecpey_block_product_data_consent_mutation();
DROP TRIGGER IF EXISTS product_data_consent_events_no_delete ON product_data_consent_events;
CREATE TRIGGER product_data_consent_events_no_delete
BEFORE DELETE ON product_data_consent_events
FOR EACH ROW EXECUTE FUNCTION tecpey_block_product_data_consent_mutation();

CREATE OR REPLACE VIEW product_data_effective_consents AS
SELECT latest.*
FROM (
  SELECT DISTINCT ON (tenant_id, principal_id, exchange_product_account_id, receiving_service, purpose, scope)
    id, event_sequence, tenant_id, principal_id, link_transaction_id,
    exchange_product_account_id, receiving_service, purpose, scope, status,
    policy_version, jurisdiction, expires_at, occurred_at
  FROM product_data_consent_events
  ORDER BY tenant_id, principal_id, exchange_product_account_id, receiving_service, purpose, scope, event_sequence DESC
) latest
JOIN platform_principals principal
  ON principal.tenant_id = latest.tenant_id AND principal.id = latest.principal_id
JOIN platform_product_accounts exchange_account
  ON exchange_account.tenant_id = latest.tenant_id
 AND exchange_account.id = latest.exchange_product_account_id
 AND exchange_account.principal_id = latest.principal_id
 AND exchange_account.product = 'exchange'
JOIN product_account_link_transactions link
  ON link.tenant_id = latest.tenant_id
 AND link.id = latest.link_transaction_id
 AND link.principal_id = latest.principal_id
WHERE latest.status = 'granted'
  AND (latest.expires_at IS NULL OR latest.expires_at > NOW())
  AND principal.status = 'active'
  AND exchange_account.status = 'active'
  AND link.status = 'completed';
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

export async function runIdentityProductLinkingMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(IDENTITY_PRODUCT_LINKING_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-identity-product-linking] checksum mismatch for ${FILENAME}`);
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(IDENTITY_PRODUCT_LINKING_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
