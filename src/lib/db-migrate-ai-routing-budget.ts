import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { AI_AUTOMATION_RUN_TRANSITION_FUNCTION_SQL } from "./db-migrate-ai-automation";
import { logger } from "./logger";

const FILENAME = "0094_ai_routing_budget.sql";

export const AI_SCHEMA96_FORWARD_RECONCILIATION_SQL = `
-- Main before 0094 contains two evolved canonical migrations (0091/0092).
-- Their historical ledger identities must remain immutable, so reconcile the
-- missing forward schema here, at the first migration not yet present in that
-- release. Every operation is idempotent for clean and already-upgraded stores.
ALTER TABLE ai_automation_runs
  ADD COLUMN IF NOT EXISTS command_hash TEXT,
  ADD COLUMN IF NOT EXISTS execution_connector_id TEXT;

-- Historical runs predate the command envelope. A deliberately non-replayable
-- deterministic value preserves the row without falsely accepting a new command.
UPDATE ai_automation_runs
   SET command_hash = md5('tecpey-legacy-command-v1:' || id::text || ':' || input_hash)
                    || md5('tecpey-legacy-command-v2:' || id::text || ':' || input_hash)
 WHERE command_hash IS NULL;

-- Preserve historical execution evidence explicitly instead of inventing a
-- live connector binding. New transitions can never produce this prefix.
UPDATE ai_automation_runs
   SET execution_connector_id = 'legacy-unbound:' || id::text
 WHERE execution_started_at IS NOT NULL
   AND execution_connector_id IS NULL;

ALTER TABLE ai_automation_runs
  ALTER COLUMN command_hash SET NOT NULL;

DO $schema96_legacy_execution_check$
DECLARE
  legacy_constraint TEXT;
BEGIN
  FOR legacy_constraint IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'ai_automation_runs'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%execution_started_at%'
       AND pg_get_constraintdef(oid) NOT LIKE '%execution_connector_id%'
  LOOP
    EXECUTE format(
      'ALTER TABLE ai_automation_runs DROP CONSTRAINT %I',
      legacy_constraint
    );
  END LOOP;
END
$schema96_legacy_execution_check$;

DO $schema96_legacy_knowledge_fk$
DECLARE
  legacy_constraint TEXT;
BEGIN
  FOR legacy_constraint IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'ai_knowledge_item_events'::regclass
       AND contype = 'f'
       AND pg_get_constraintdef(oid) =
         'FOREIGN KEY (knowledge_item_id) REFERENCES ai_knowledge_items(id) ON DELETE RESTRICT'
  LOOP
    EXECUTE format(
      'ALTER TABLE ai_knowledge_item_events DROP CONSTRAINT %I',
      legacy_constraint
    );
  END LOOP;
END
$schema96_legacy_knowledge_fk$;

DO $schema96_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'ai_automation_runs'::regclass
       AND conname = 'ai_automation_runs_command_hash_check'
  ) THEN
    ALTER TABLE ai_automation_runs
      ADD CONSTRAINT ai_automation_runs_command_hash_check
      CHECK (command_hash ~ '^[0-9a-f]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'ai_automation_runs'::regclass
       AND conname = 'ai_automation_runs_execution_connector_check'
  ) THEN
    ALTER TABLE ai_automation_runs
      ADD CONSTRAINT ai_automation_runs_execution_connector_check CHECK (
        execution_connector_id IS NULL OR
        execution_connector_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'ai_automation_runs'::regclass
       AND conname = 'ai_automation_runs_started_connector_check'
  ) THEN
    ALTER TABLE ai_automation_runs
      ADD CONSTRAINT ai_automation_runs_started_connector_check CHECK (
        execution_started_at IS NULL OR (
          execution_connector_id IS NOT NULL AND
          status IN ('executing', 'completed', 'failed', 'blocked')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'ai_knowledge_items'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, workspace_id, id)'
  ) THEN
    ALTER TABLE ai_knowledge_items
      ADD CONSTRAINT ai_knowledge_items_tenant_workspace_id_key
      UNIQUE (tenant_id, workspace_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'ai_knowledge_item_events'::regclass
       AND contype = 'f'
       AND pg_get_constraintdef(oid) LIKE
         'FOREIGN KEY (tenant_id, workspace_id, knowledge_item_id) REFERENCES ai_knowledge_items(tenant_id, workspace_id, id)%'
  ) THEN
    ALTER TABLE ai_knowledge_item_events
      ADD CONSTRAINT ai_knowledge_item_events_scope_fk
      FOREIGN KEY (tenant_id, workspace_id, knowledge_item_id)
      REFERENCES ai_knowledge_items(tenant_id, workspace_id, id)
      ON DELETE RESTRICT;
  END IF;
END
$schema96_constraints$;

DO $schema96_workflow_unique$
DECLARE
  legacy_constraint TEXT;
BEGIN
  FOR legacy_constraint IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'ai_workflow_run_evidence'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, run_id, status)'
  LOOP
    EXECUTE format(
      'ALTER TABLE ai_workflow_run_evidence DROP CONSTRAINT %I',
      legacy_constraint
    );
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'ai_workflow_run_evidence'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) =
         'UNIQUE (tenant_id, workspace_id, run_id, status)'
  ) THEN
    ALTER TABLE ai_workflow_run_evidence
      ADD CONSTRAINT ai_workflow_run_evidence_scope_status_key
      UNIQUE (tenant_id, workspace_id, run_id, status);
  END IF;
END
$schema96_workflow_unique$;

${AI_AUTOMATION_RUN_TRANSITION_FUNCTION_SQL}
`;

export const AI_ROUTING_BUDGET_SQL = `
${AI_SCHEMA96_FORWARD_RECONCILIATION_SQL}

ALTER TABLE ai_agent_bindings
  ADD COLUMN IF NOT EXISTS max_request_cost_usd_micros BIGINT NOT NULL DEFAULT 1000000;

ALTER TABLE ai_agent_bindings
  DROP CONSTRAINT IF EXISTS ai_agent_bindings_max_request_cost_check;
ALTER TABLE ai_agent_bindings
  ADD CONSTRAINT ai_agent_bindings_max_request_cost_check CHECK (
    max_request_cost_usd_micros BETWEEN 1000 AND 100000000000
    AND max_request_cost_usd_micros <= monthly_budget_usd_micros
  );

CREATE TABLE IF NOT EXISTS ai_agent_spend_monthly (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL CHECK (agent_id IN (
    'mentor_coach',
    'news_x_researcher',
    'coin_tool_researcher',
    'content_reviewer',
    'executive_briefing',
    'knowledge_curator',
    'risk_compliance_reviewer'
  )),
  budget_month DATE NOT NULL,
  active_reserved_usd_micros BIGINT NOT NULL DEFAULT 0
    CHECK (active_reserved_usd_micros >= 0),
  settled_usd_micros BIGINT NOT NULL DEFAULT 0
    CHECK (settled_usd_micros >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, workspace_id, agent_id, budget_month),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE,
  CHECK (budget_month = date_trunc('month', budget_month)::date)
);

CREATE INDEX IF NOT EXISTS ai_agent_spend_monthly_scope_idx
  ON ai_agent_spend_monthly
    (tenant_id, workspace_id, budget_month DESC, agent_id);

CREATE TABLE IF NOT EXISTS ai_spend_reservations (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL CHECK (agent_id IN (
    'mentor_coach',
    'news_x_researcher',
    'coin_tool_researcher',
    'content_reviewer',
    'executive_briefing',
    'knowledge_curator',
    'risk_compliance_reviewer'
  )),
  budget_month DATE NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  reserved_usd_micros BIGINT NOT NULL CHECK (reserved_usd_micros BETWEEN 1000 AND 100000000000),
  settled_usd_micros BIGINT CHECK (settled_usd_micros IS NULL OR settled_usd_micros >= 0),
  overrun_usd_micros BIGINT NOT NULL DEFAULT 0 CHECK (overrun_usd_micros >= 0),
  egress_attempt_id UUID,
  egress_started_at TIMESTAMPTZ,
  reconciliation_required BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'settled', 'released')),
  expires_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, workspace_id, agent_id, idempotency_key),
  UNIQUE (id, tenant_id, workspace_id, agent_id),
  FOREIGN KEY (tenant_id, workspace_id, agent_id, budget_month)
    REFERENCES ai_agent_spend_monthly(tenant_id, workspace_id, agent_id, budget_month)
      ON DELETE RESTRICT,
  CHECK ((egress_attempt_id IS NULL) = (egress_started_at IS NULL)),
  CHECK (
    (
      status = 'active'
      AND settled_usd_micros IS NULL
      AND overrun_usd_micros = 0
      AND settled_at IS NULL
      AND reconciliation_required = FALSE
    )
    OR (
      status = 'settled'
      AND settled_usd_micros IS NOT NULL
      AND overrun_usd_micros = GREATEST(settled_usd_micros - reserved_usd_micros, 0)
      AND settled_at IS NOT NULL
      AND egress_attempt_id IS NOT NULL
    )
    OR (
      status = 'released'
      AND settled_usd_micros = 0
      AND overrun_usd_micros = 0
      AND settled_at IS NOT NULL
      AND egress_attempt_id IS NULL
      AND reconciliation_required = FALSE
    )
  )
);

CREATE INDEX IF NOT EXISTS ai_spend_reservations_active_idx
  ON ai_spend_reservations
    (tenant_id, workspace_id, agent_id, expires_at, id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS ai_routing_decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id UUID NOT NULL,
  agent_id TEXT NOT NULL CHECK (agent_id IN (
    'mentor_coach',
    'news_x_researcher',
    'coin_tool_researcher',
    'content_reviewer',
    'executive_briefing',
    'knowledge_curator',
    'risk_compliance_reviewer'
  )),
  provider_id TEXT CHECK (provider_id IS NULL OR provider_id IN (
    'openai', 'anthropic', 'perplexity', 'xai', 'openrouter'
  )),
  route_mode TEXT NOT NULL CHECK (route_mode IN (
    'primary', 'alternate', 'openrouter_paid', 'openrouter_free', 'blocked'
  )),
  decision_code TEXT NOT NULL CHECK (decision_code ~ '^[a-z][a-z0-9_]{2,79}$'),
  candidate_count SMALLINT NOT NULL CHECK (candidate_count BETWEEN 0 AND 20),
  data_class TEXT NOT NULL CHECK (data_class IN (
    'public', 'aggregate_deidentified', 'approved_platform_content',
    'private_user', 'restricted_admin'
  )),
  criticality TEXT NOT NULL CHECK (criticality IN ('noncritical', 'standard', 'critical')),
  external_effect BOOLEAN NOT NULL,
  approval_mode TEXT NOT NULL CHECK (approval_mode IN (
    'none', 'before_publish', 'before_knowledge_promotion', 'before_external_effect'
  )),
  spend_reservation_id UUID,
  requested_model TEXT CHECK (
    requested_model IS NULL
    OR (
      length(requested_model) BETWEEN 1 AND 160
      AND requested_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
    )
  ),
  actual_model TEXT CHECK (
    actual_model IS NULL
    OR (
      length(actual_model) BETWEEN 1 AND 160
      AND actual_model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
    )
  ),
  provider_attempt_count SMALLINT NOT NULL DEFAULT 0
    CHECK (provider_attempt_count BETWEEN 0 AND 20),
  reserved_usd_micros BIGINT,
  accounted_cost_usd_micros BIGINT,
  overrun_usd_micros BIGINT,
  decision_hash TEXT NOT NULL CHECK (decision_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (spend_reservation_id, tenant_id, workspace_id, agent_id)
    REFERENCES ai_spend_reservations(id, tenant_id, workspace_id, agent_id)
      ON DELETE RESTRICT,
  CHECK (
    (
      spend_reservation_id IS NULL
      AND reserved_usd_micros IS NULL
      AND accounted_cost_usd_micros IS NULL
      AND overrun_usd_micros IS NULL
    )
    OR (
      spend_reservation_id IS NOT NULL
      AND reserved_usd_micros IS NOT NULL
      AND reserved_usd_micros BETWEEN 1000 AND 100000000000
      AND accounted_cost_usd_micros IS NOT NULL
      AND accounted_cost_usd_micros >= 0
      AND overrun_usd_micros IS NOT NULL
      AND overrun_usd_micros = GREATEST(
        accounted_cost_usd_micros - reserved_usd_micros,
        0
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS ai_routing_decision_events_scope_idx
  ON ai_routing_decision_events
    (tenant_id, workspace_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ai_routing_decision_events_reservation_scope_idx
  ON ai_routing_decision_events
    (spend_reservation_id, tenant_id, workspace_id, agent_id)
  WHERE spend_reservation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_routing_decision_events_reservation_once_idx
  ON ai_routing_decision_events
    (tenant_id, workspace_id, agent_id, spend_reservation_id)
  WHERE spend_reservation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION tecpey_guard_ai_spend_reservation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
     OR NEW.budget_month IS DISTINCT FROM OLD.budget_month
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.reserved_usd_micros IS DISTINCT FROM OLD.reserved_usd_micros
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Invalid AI spend reservation transition';
  END IF;

  IF OLD.status = 'active' AND NEW.status = 'active' THEN
    IF OLD.egress_attempt_id IS NOT NULL
       OR NEW.egress_attempt_id IS NULL
       OR NEW.egress_started_at IS NULL
       OR NEW.settled_usd_micros IS DISTINCT FROM OLD.settled_usd_micros
       OR NEW.overrun_usd_micros IS DISTINCT FROM OLD.overrun_usd_micros
       OR NEW.settled_at IS DISTINCT FROM OLD.settled_at
       OR NEW.reconciliation_required IS DISTINCT FROM FALSE THEN
      RAISE EXCEPTION 'Invalid AI spend egress mark';
    END IF;
  ELSIF OLD.status = 'active' AND NEW.status = 'released' THEN
    IF OLD.egress_attempt_id IS NOT NULL
       OR NEW.egress_attempt_id IS NOT NULL
       OR NEW.reconciliation_required IS DISTINCT FROM FALSE THEN
      RAISE EXCEPTION 'Marked AI spend reservation cannot be released';
    END IF;
  ELSIF OLD.status = 'active' AND NEW.status = 'settled' THEN
    IF OLD.egress_attempt_id IS NULL
       OR NEW.egress_attempt_id IS DISTINCT FROM OLD.egress_attempt_id
       OR NEW.egress_started_at IS DISTINCT FROM OLD.egress_started_at THEN
      RAISE EXCEPTION 'AI spend settlement requires its durable egress attempt';
    END IF;
  ELSIF OLD.status = 'settled' AND NEW.status = 'settled' THEN
    IF NEW.egress_attempt_id IS DISTINCT FROM OLD.egress_attempt_id
       OR NEW.egress_started_at IS DISTINCT FROM OLD.egress_started_at
       OR NEW.settled_at IS DISTINCT FROM OLD.settled_at
       OR NEW.settled_usd_micros < OLD.settled_usd_micros
       OR (OLD.reconciliation_required = FALSE AND NEW.reconciliation_required = TRUE) THEN
      RAISE EXCEPTION 'Invalid late AI spend settlement';
    END IF;
  ELSE
    RAISE EXCEPTION 'AI spend reservation is terminal';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_spend_reservations_guard_update ON ai_spend_reservations;
CREATE TRIGGER ai_spend_reservations_guard_update
BEFORE UPDATE ON ai_spend_reservations
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_ai_spend_reservation();

DROP TRIGGER IF EXISTS ai_spend_reservations_no_delete ON ai_spend_reservations;
CREATE TRIGGER ai_spend_reservations_no_delete
BEFORE DELETE ON ai_spend_reservations
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

DROP TRIGGER IF EXISTS ai_routing_decision_events_no_update ON ai_routing_decision_events;
CREATE TRIGGER ai_routing_decision_events_no_update
BEFORE UPDATE ON ai_routing_decision_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

DROP TRIGGER IF EXISTS ai_routing_decision_events_no_delete ON ai_routing_decision_events;
CREATE TRIGGER ai_routing_decision_events_no_delete
BEFORE DELETE ON ai_routing_decision_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAiRoutingBudgetMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(AI_ROUTING_BUDGET_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-ai-routing-budget] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(AI_ROUTING_BUDGET_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("[db-migrate-ai-routing-budget] migration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
