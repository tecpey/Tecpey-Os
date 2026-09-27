import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0115_deep_research_provenance_authority.sql";

export const DEEP_RESEARCH_TABLES = Object.freeze([
  "ai_research_runs",
  "ai_research_sources",
  "ai_research_claims",
  "ai_research_claim_citations",
  "ai_research_conflict_sets",
  "ai_research_conflict_members",
  "ai_research_artifacts",
  "ai_research_api_commands",
] as const);

export const DEEP_RESEARCH_PROVENANCE_SQL = `
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS ai_research_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  question TEXT NOT NULL CHECK (length(btrim(question)) BETWEEN 1 AND 12000),
  locale TEXT NOT NULL CHECK (locale IN ('fa','en')),
  requested_freshness TEXT NOT NULL DEFAULT 'current'
    CHECK (requested_freshness IN ('current','day','week','month','historical')),
  provider_strategy JSONB NOT NULL DEFAULT '{}'::jsonb,
  state TEXT NOT NULL DEFAULT 'planned'
    CHECK (state IN ('planned','gathering','synthesizing','verifying','reporting','completed','failed','cancelled')),
  budget JSONB NOT NULL DEFAULT '{}'::jsonb,
  degraded_reason TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (id, tenant_id, workspace_id),
  CHECK (octet_length(provider_strategy::text) <= 32768),
  CHECK (octet_length(budget::text) <= 16384)
);

CREATE TABLE IF NOT EXISTS ai_research_api_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create','cancel')),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 120 AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'),
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  correlation_id TEXT NOT NULL CHECK (char_length(correlation_id) BETWEEN 8 AND 160 AND correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed')),
  http_status INTEGER CHECK (http_status IS NULL OR http_status BETWEEN 200 AND 499),
  response_body JSONB,
  resource_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES platform_workspaces(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, account_id, operation, idempotency_key),
  CHECK ((status = 'processing' AND http_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
      OR (status = 'completed' AND http_status IS NOT NULL AND jsonb_typeof(response_body) = 'object' AND completed_at IS NOT NULL)),
  CHECK (response_body IS NULL OR octet_length(response_body::text) <= 16384)
);

CREATE TABLE IF NOT EXISTS ai_research_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, run_id UUID NOT NULL,
  url TEXT NOT NULL CHECK (length(url) BETWEEN 1 AND 8192),
  publisher TEXT, domain TEXT, title TEXT,
  retrieved_at TIMESTAMPTZ NOT NULL, published_at TIMESTAMPTZ, locale TEXT,
  source_channel TEXT NOT NULL CHECK (source_channel IN ('public_web','connected_private','social_x','other')),
  provider_id TEXT NOT NULL, provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_digest TEXT CHECK (content_digest IS NULL OR content_digest ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (run_id, tenant_id, workspace_id) REFERENCES ai_research_runs(id, tenant_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (id, tenant_id, workspace_id),
  UNIQUE (id, tenant_id, workspace_id, run_id),
  CHECK (octet_length(provider_metadata::text) <= 32768)
);

CREATE TABLE IF NOT EXISTS ai_research_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, run_id UUID NOT NULL,
  report_section TEXT NOT NULL CHECK (length(report_section) BETWEEN 1 AND 120),
  normalized_text TEXT NOT NULL CHECK (length(btrim(normalized_text)) BETWEEN 1 AND 16000),
  claim_type TEXT NOT NULL CHECK (claim_type IN ('externally_factual','synthesis','opinion','unresolved')),
  freshness_class TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (freshness_class IN ('live','day','week','month','historical','not_applicable')),
  confidence_rationale TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (run_id, tenant_id, workspace_id) REFERENCES ai_research_runs(id, tenant_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (id, tenant_id, workspace_id),
  UNIQUE (id, tenant_id, workspace_id, run_id)
);

CREATE TABLE IF NOT EXISTS ai_research_claim_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, run_id UUID NOT NULL,
  claim_id UUID NOT NULL, source_id UUID NOT NULL,
  locator JSONB NOT NULL DEFAULT '{}'::jsonb, annotation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (run_id, tenant_id, workspace_id) REFERENCES ai_research_runs(id, tenant_id, workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY (claim_id, tenant_id, workspace_id, run_id) REFERENCES ai_research_claims(id, tenant_id, workspace_id, run_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_id, tenant_id, workspace_id, run_id) REFERENCES ai_research_sources(id, tenant_id, workspace_id, run_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, run_id, claim_id, source_id), CHECK (octet_length(locator::text) <= 8192)
);

CREATE TABLE IF NOT EXISTS ai_research_conflict_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, run_id UUID NOT NULL,
  summary TEXT NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 12000),
  resolution_state TEXT NOT NULL DEFAULT 'unresolved' CHECK (resolution_state IN ('unresolved','partially_resolved','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (run_id, tenant_id, workspace_id) REFERENCES ai_research_runs(id, tenant_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (id, tenant_id, workspace_id),
  UNIQUE (id, tenant_id, workspace_id, run_id)
);

CREATE TABLE IF NOT EXISTS ai_research_conflict_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, run_id UUID NOT NULL,
  conflict_set_id UUID NOT NULL, claim_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (run_id, tenant_id, workspace_id) REFERENCES ai_research_runs(id, tenant_id, workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY (conflict_set_id, tenant_id, workspace_id, run_id) REFERENCES ai_research_conflict_sets(id, tenant_id, workspace_id, run_id) ON DELETE RESTRICT,
  FOREIGN KEY (claim_id, tenant_id, workspace_id, run_id) REFERENCES ai_research_claims(id, tenant_id, workspace_id, run_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, workspace_id, run_id, conflict_set_id, claim_id)
);

CREATE TABLE IF NOT EXISTS ai_research_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, run_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_count INTEGER NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  cited_source_count INTEGER NOT NULL DEFAULT 0 CHECK (cited_source_count >= 0 AND cited_source_count <= source_count),
  finalized_at TIMESTAMPTZ, supersedes_artifact_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (run_id, tenant_id, workspace_id) REFERENCES ai_research_runs(id, tenant_id, workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY (supersedes_artifact_id, tenant_id, workspace_id, run_id) REFERENCES ai_research_artifacts(id, tenant_id, workspace_id, run_id) ON DELETE RESTRICT,
  UNIQUE (run_id, version), UNIQUE (id, tenant_id, workspace_id), UNIQUE (id, tenant_id, workspace_id, run_id),
  CHECK ((status = 'draft' AND finalized_at IS NULL) OR (status = 'final' AND finalized_at IS NOT NULL)),
  CHECK (octet_length(report::text) <= 1048576)
);

CREATE INDEX IF NOT EXISTS ai_research_api_commands_scope_idx ON ai_research_api_commands (tenant_id, workspace_id, account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_research_runs_scope_created_idx ON ai_research_runs (tenant_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_research_sources_run_idx ON ai_research_sources (tenant_id, workspace_id, run_id, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS ai_research_claims_run_idx ON ai_research_claims (tenant_id, workspace_id, run_id, created_at);
CREATE INDEX IF NOT EXISTS ai_research_citations_claim_idx ON ai_research_claim_citations (tenant_id, workspace_id, claim_id);
CREATE INDEX IF NOT EXISTS ai_research_conflict_members_set_idx ON ai_research_conflict_members (tenant_id, workspace_id, run_id, conflict_set_id);
CREATE INDEX IF NOT EXISTS ai_research_artifacts_run_idx ON ai_research_artifacts (tenant_id, workspace_id, run_id, version DESC);

REVOKE ALL ON TABLE ai_research_runs, ai_research_sources, ai_research_claims, ai_research_claim_citations, ai_research_conflict_sets, ai_research_conflict_members, ai_research_artifacts, ai_research_api_commands
FROM PUBLIC, tecpey_ai_tenant_runtime, tecpey_ai_worker;
GRANT SELECT, INSERT, UPDATE ON TABLE ai_research_runs, ai_research_artifacts, ai_research_api_commands TO tecpey_ai_tenant_runtime;
GRANT SELECT, INSERT ON TABLE ai_research_sources, ai_research_claims, ai_research_claim_citations, ai_research_conflict_sets, ai_research_conflict_members TO tecpey_ai_tenant_runtime;

DO $research_rls$
DECLARE relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['ai_research_runs','ai_research_sources','ai_research_claims','ai_research_claim_citations','ai_research_conflict_sets','ai_research_conflict_members','ai_research_artifacts','ai_research_api_commands'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', relation_name || '_tenant_scope', relation_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO tecpey_ai_tenant_runtime USING (jsonb_build_array(tenant_id, workspace_id) = (SELECT tecpey_ai_authorized_context())) WITH CHECK (jsonb_build_array(tenant_id, workspace_id) = (SELECT tecpey_ai_authorized_context()))', relation_name || '_tenant_scope', relation_name);
  END LOOP;
END
$research_rls$;

CREATE OR REPLACE FUNCTION tecpey_guard_final_research_artifact()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $guard$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'final' THEN RAISE EXCEPTION 'final research artifacts are immutable' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'final' THEN RAISE EXCEPTION 'final research artifacts are immutable' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'final' THEN
    IF NEW.finalized_at IS NULL THEN RAISE EXCEPTION 'finalized_at is required for final research artifacts' USING ERRCODE = '23514'; END IF;
    IF EXISTS (
      SELECT 1 FROM ai_research_claims c
      WHERE c.tenant_id = NEW.tenant_id AND c.workspace_id = NEW.workspace_id AND c.run_id = NEW.run_id
        AND c.claim_type = 'externally_factual'
        AND NOT EXISTS (
          SELECT 1 FROM ai_research_claim_citations cc
          WHERE cc.tenant_id = c.tenant_id AND cc.workspace_id = c.workspace_id
            AND cc.run_id = c.run_id AND cc.claim_id = c.id
        )
    ) THEN RAISE EXCEPTION 'externally factual research claims require citations before finalization' USING ERRCODE = '23514'; END IF;
    IF EXISTS (
      SELECT 1 FROM ai_research_claims c
      WHERE c.tenant_id = NEW.tenant_id AND c.workspace_id = NEW.workspace_id AND c.run_id = NEW.run_id
        AND c.claim_type = 'externally_factual'
        AND c.freshness_class IN ('live','day','week','month')
        AND NOT EXISTS (
          SELECT 1 FROM ai_research_claim_citations cc
          JOIN ai_research_sources s ON s.id = cc.source_id AND s.tenant_id = cc.tenant_id
            AND s.workspace_id = cc.workspace_id AND s.run_id = cc.run_id
          WHERE cc.tenant_id = c.tenant_id AND cc.workspace_id = c.workspace_id
            AND cc.run_id = c.run_id AND cc.claim_id = c.id
            AND s.retrieved_at IS NOT NULL
        )
    ) THEN RAISE EXCEPTION 'time-sensitive factual research claims require freshness evidence' USING ERRCODE = '23514'; END IF;
    IF EXISTS (
      SELECT 1 FROM ai_research_claims c
      WHERE c.tenant_id = NEW.tenant_id AND c.workspace_id = NEW.workspace_id AND c.run_id = NEW.run_id
        AND c.claim_type = 'externally_factual'
        AND NOT EXISTS (
          SELECT 1 FROM ai_research_claim_citations cc
          JOIN ai_research_sources s ON s.id = cc.source_id AND s.tenant_id = cc.tenant_id
            AND s.workspace_id = cc.workspace_id AND s.run_id = cc.run_id
          WHERE cc.tenant_id = c.tenant_id AND cc.workspace_id = c.workspace_id
            AND cc.run_id = c.run_id AND cc.claim_id = c.id
            AND s.source_channel <> 'social_x'
        )
    ) THEN RAISE EXCEPTION 'social-only evidence cannot finalize externally factual research claims' USING ERRCODE = '23514'; END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.run_id IS DISTINCT FROM OLD.run_id OR NEW.version IS DISTINCT FROM OLD.version OR NEW.created_at IS DISTINCT FROM OLD.created_at
      THEN RAISE EXCEPTION 'research artifact identity is immutable' USING ERRCODE = '55000'; END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$guard$;
REVOKE ALL ON FUNCTION tecpey_guard_final_research_artifact() FROM PUBLIC;
DROP TRIGGER IF EXISTS ai_research_artifacts_final_immutable ON ai_research_artifacts;
CREATE TRIGGER ai_research_artifacts_final_immutable BEFORE UPDATE OR DELETE ON ai_research_artifacts
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_final_research_artifact();
`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/g, "\n").trim()).digest("hex");
}
export async function runDeepResearchProvenanceMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(DEEP_RESEARCH_PROVENANCE_SQL);
  const applied = await client.query<{ checksum: string }>("SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1", [FILENAME]);
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) throw new Error(`[db-migrate-deep-research] checksum mismatch for ${FILENAME}`);
    return;
  }
  await client.query("BEGIN");
  try {
    await client.query(DEEP_RESEARCH_PROVENANCE_SQL);
    await client.query("INSERT INTO _migrations (filename, checksum) VALUES ($1,$2)", [FILENAME, cs]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}
