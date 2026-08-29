import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0095_ai_route_candidates.sql";

export const AI_ROUTE_CANDIDATES_SQL = `
CREATE TABLE IF NOT EXISTS ai_agent_route_candidates (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL CHECK (agent_id IN (
    'mentor_coach', 'news_x_researcher', 'coin_tool_researcher',
    'content_reviewer', 'executive_briefing', 'knowledge_curator',
    'risk_compliance_reviewer'
  )),
  provider_id TEXT NOT NULL CHECK (provider_id IN (
    'openai', 'anthropic', 'perplexity', 'xai', 'openrouter'
  )),
  model TEXT NOT NULL CHECK (
    length(model) BETWEEN 1 AND 160
    AND model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
  ),
  priority SMALLINT NOT NULL CHECK (priority BETWEEN 1 AND 20),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  estimated_max_cost_usd_micros BIGINT NOT NULL
    CHECK (estimated_max_cost_usd_micros BETWEEN 0 AND 100000000000),
  expected_latency_ms INTEGER NOT NULL
    CHECK (expected_latency_ms BETWEEN 100 AND 30000),
  zero_data_retention BOOLEAN NOT NULL DEFAULT TRUE
    CHECK (zero_data_retention = TRUE),
  free BOOLEAN NOT NULL DEFAULT FALSE,
  supported_data_classes TEXT[] NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, workspace_id, agent_id, provider_id, model),
  FOREIGN KEY (tenant_id, workspace_id, provider_id)
    REFERENCES ai_provider_configs(tenant_id, workspace_id, provider_id)
      ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, workspace_id, agent_id)
    REFERENCES ai_agent_bindings(tenant_id, workspace_id, agent_id)
      ON DELETE CASCADE,
  CHECK (
    cardinality(supported_data_classes) BETWEEN 1 AND 5
    AND supported_data_classes <@ ARRAY[
      'public', 'aggregate_deidentified', 'approved_platform_content',
      'private_user', 'restricted_admin'
    ]::TEXT[]
  ),
  CHECK (
    (
      free = FALSE
      AND estimated_max_cost_usd_micros BETWEEN 1000 AND 100000000000
    )
    OR (
      free = TRUE
      AND provider_id = 'openrouter'
      AND (model = 'openrouter/free' OR model ~* ':free$')
      AND supported_data_classes = ARRAY['public']::TEXT[]
      AND estimated_max_cost_usd_micros = 0
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_agent_route_candidates_priority_idx
  ON ai_agent_route_candidates
    (tenant_id, workspace_id, agent_id, priority);

CREATE INDEX IF NOT EXISTS ai_agent_route_candidates_scope_idx
  ON ai_agent_route_candidates
    (tenant_id, workspace_id, agent_id, enabled, priority);

CREATE TABLE IF NOT EXISTS ai_agent_route_candidate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL CHECK (agent_id IN (
    'mentor_coach', 'news_x_researcher', 'coin_tool_researcher',
    'content_reviewer', 'executive_briefing', 'knowledge_curator',
    'risk_compliance_reviewer'
  )),
  event_type TEXT NOT NULL CHECK (event_type IN ('replaced')),
  route_count SMALLINT NOT NULL CHECK (route_count BETWEEN 0 AND 5),
  revision BIGINT NOT NULL CHECK (revision > 0),
  routes_snapshot JSONB NOT NULL,
  actor_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES platform_workspaces(tenant_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(routes_snapshot) = 'array'),
  CHECK (jsonb_array_length(routes_snapshot) = route_count),
  CHECK (octet_length(routes_snapshot::text) <= 16384),
  CHECK (NOT (routes_snapshot::text ~* '(api.?key|secret|token|password|credential|authorization)'))
);

CREATE INDEX IF NOT EXISTS ai_agent_route_candidate_events_scope_idx
  ON ai_agent_route_candidate_events
    (tenant_id, workspace_id, agent_id, created_at DESC, id DESC);

DROP TRIGGER IF EXISTS ai_agent_route_candidate_events_no_update
  ON ai_agent_route_candidate_events;
CREATE TRIGGER ai_agent_route_candidate_events_no_update
BEFORE UPDATE ON ai_agent_route_candidate_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();

DROP TRIGGER IF EXISTS ai_agent_route_candidate_events_no_delete
  ON ai_agent_route_candidate_events;
CREATE TRIGGER ai_agent_route_candidate_events_no_delete
BEFORE DELETE ON ai_agent_route_candidate_events
FOR EACH ROW EXECUTE FUNCTION tecpey_reject_ai_control_event_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAiRouteCandidateMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(AI_ROUTE_CANDIDATES_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-ai-route-candidates] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }
  try {
    await client.query(AI_ROUTE_CANDIDATES_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
  } catch (error) {
    logger.error("[db-migrate-ai-route-candidates] migration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
