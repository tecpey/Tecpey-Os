import type { PoolClient } from "pg";

export async function migrateCommandIdempotency(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS api_command_idempotency (
      tenant_id TEXT NOT NULL,
      principal_type TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      response_status INTEGER,
      response_body JSONB,
      lease_until TIMESTAMPTZ,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      last_error_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
      PRIMARY KEY (tenant_id, principal_type, principal_id, operation, idempotency_key),
      CONSTRAINT api_command_idempotency_tenant_chk
        CHECK (char_length(tenant_id) BETWEEN 1 AND 80),
      CONSTRAINT api_command_idempotency_principal_type_chk
        CHECK (principal_type ~ '^[a-z][a-z0-9._-]{0,63}$'),
      CONSTRAINT api_command_idempotency_principal_id_chk
        CHECK (char_length(principal_id) BETWEEN 1 AND 220),
      CONSTRAINT api_command_idempotency_operation_chk
        CHECK (operation ~ '^[a-z][a-z0-9._:-]{2,159}$'),
      CONSTRAINT api_command_idempotency_key_chk
        CHECK (
          char_length(idempotency_key) BETWEEN 8 AND 160
          AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
        ),
      CONSTRAINT api_command_idempotency_hash_chk
        CHECK (request_hash ~ '^[a-f0-9]{64}$'),
      CONSTRAINT api_command_idempotency_state_chk
        CHECK (state IN ('pending', 'completed')),
      CONSTRAINT api_command_idempotency_attempt_chk
        CHECK (attempt_count >= 1),
      CONSTRAINT api_command_idempotency_response_chk
        CHECK (
          (state = 'pending' AND response_status IS NULL AND response_body IS NULL)
          OR
          (
            state = 'completed'
            AND response_status BETWEEN 100 AND 599
            AND response_body IS NOT NULL
          )
        )
    );

    CREATE INDEX IF NOT EXISTS api_command_idempotency_expiry_idx
      ON api_command_idempotency (expires_at);

    CREATE INDEX IF NOT EXISTS api_command_idempotency_pending_lease_idx
      ON api_command_idempotency (lease_until)
      WHERE state = 'pending';

    CREATE OR REPLACE FUNCTION guard_completed_api_command_idempotency()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.state = 'completed' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'completed_api_command_idempotency_is_immutable';
      END IF;

      IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.principal_type IS DISTINCT FROM OLD.principal_type
        OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
        OR NEW.operation IS DISTINCT FROM OLD.operation
        OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
        OR NEW.request_hash IS DISTINCT FROM OLD.request_hash THEN
        RAISE EXCEPTION 'api_command_idempotency_identity_is_immutable';
      END IF;

      NEW.updated_at := NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_guard_completed_api_command_idempotency
      ON api_command_idempotency;

    CREATE TRIGGER trg_guard_completed_api_command_idempotency
      BEFORE UPDATE ON api_command_idempotency
      FOR EACH ROW
      EXECUTE FUNCTION guard_completed_api_command_idempotency();
  `);
}
