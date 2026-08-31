import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0096_ai_tenant_row_level_security.sql";

export const AI_TENANT_RLS_TABLES = Object.freeze([
  "ai_provider_configs",
  "ai_provider_config_events",
  "ai_agent_bindings",
  "ai_agent_usage_daily",
  "ai_agent_binding_events",
  "ai_knowledge_items",
  "ai_knowledge_item_events",
  "ai_workflow_run_evidence",
  "ai_provider_quota_snapshots",
  "ai_automation_policies",
  "ai_automation_policy_events",
  "ai_automation_runs",
  "ai_automation_reviews",
  "ai_automation_run_events",
  "ai_agent_spend_monthly",
  "ai_spend_reservations",
  "ai_routing_decision_events",
  "ai_agent_route_candidates",
  "ai_agent_route_candidate_events",
] as const);

export const AI_TENANT_RLS_SQL = `
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $roles$
DECLARE
  existing_marker TEXT;
BEGIN
  SELECT shobj_description(role.oid, 'pg_authid')
    INTO existing_marker
    FROM pg_roles role
   WHERE role.rolname = 'tecpey_ai_tenant_runtime';
  IF NOT FOUND THEN
    CREATE ROLE tecpey_ai_tenant_runtime
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    COMMENT ON ROLE tecpey_ai_tenant_runtime IS
      'tecpey-managed-role:ai-tenant-runtime:v1';
  ELSIF existing_marker IS DISTINCT FROM 'tecpey-managed-role:ai-tenant-runtime:v1' THEN
    RAISE EXCEPTION 'role collision: tecpey_ai_tenant_runtime is not TecPey-managed'
      USING ERRCODE = '42710';
  END IF;

  SELECT shobj_description(role.oid, 'pg_authid')
    INTO existing_marker
    FROM pg_roles role
   WHERE role.rolname = 'tecpey_ai_worker';
  IF NOT FOUND THEN
    CREATE ROLE tecpey_ai_worker
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    COMMENT ON ROLE tecpey_ai_worker IS
      'tecpey-managed-role:ai-cross-tenant-worker:v1';
  ELSIF existing_marker IS DISTINCT FROM 'tecpey-managed-role:ai-cross-tenant-worker:v1' THEN
    RAISE EXCEPTION 'role collision: tecpey_ai_worker is not TecPey-managed'
      USING ERRCODE = '42710';
  END IF;
END
$roles$;

DO $role_posture$
DECLARE
  managed_role RECORD;
BEGIN
  FOR managed_role IN
    SELECT role.rolname,
           role.rolcanlogin,
           role.rolsuper,
           role.rolcreatedb,
           role.rolcreaterole,
           role.rolinherit,
           role.rolreplication,
           role.rolbypassrls
      FROM pg_roles role
     WHERE role.rolname IN ('tecpey_ai_tenant_runtime', 'tecpey_ai_worker')
  LOOP
    IF managed_role.rolcanlogin
       OR managed_role.rolsuper
       OR managed_role.rolcreatedb
       OR managed_role.rolcreaterole
       OR managed_role.rolinherit
       OR managed_role.rolreplication
       OR managed_role.rolbypassrls THEN
      EXECUTE format(
        'ALTER ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
        managed_role.rolname
      );
    END IF;
  END LOOP;
END
$role_posture$;

DO $role_ownership$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_shdepend owned
      JOIN pg_roles managed ON managed.oid = owned.refobjid
     WHERE owned.refclassid = 'pg_authid'::regclass
       AND owned.deptype = 'o'
       AND managed.rolname IN ('tecpey_ai_tenant_runtime', 'tecpey_ai_worker')
  ) THEN
    RAISE EXCEPTION 'managed AI runtime roles must not own SQL objects'
      USING ERRCODE = '55000';
  END IF;
END
$role_ownership$;

DO $role_memberships$
DECLARE
  membership RECORD;
BEGIN
  FOR membership IN
    SELECT granted.rolname AS granted_role, member.rolname AS member_role
      FROM pg_auth_members edge
      JOIN pg_roles granted ON granted.oid = edge.roleid
      JOIN pg_roles member ON member.oid = edge.member
     WHERE member.rolname IN ('tecpey_ai_tenant_runtime', 'tecpey_ai_worker')
  LOOP
    EXECUTE format(
      'REVOKE %I FROM %I',
      membership.granted_role,
      membership.member_role
    );
  END LOOP;
END
$role_memberships$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM tecpey_ai_tenant_runtime, tecpey_ai_worker;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

DO $pgcrypto_authority$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_depend dependency
      JOIN pg_extension installed_extension
        ON installed_extension.oid = dependency.refobjid
       AND dependency.refclassid = 'pg_extension'::regclass
     WHERE dependency.classid = 'pg_proc'::regclass
       AND dependency.objid = to_regprocedure('public.hmac(bytea,bytea,text)')
       AND dependency.deptype = 'e'
       AND installed_extension.extname = 'pgcrypto'
  ) THEN
    RAISE EXCEPTION 'public.hmac(bytea,bytea,text) is not pgcrypto-owned'
      USING ERRCODE = '55000';
  END IF;
END
$pgcrypto_authority$;

CREATE TABLE IF NOT EXISTS tecpey_ai_context_authority_keys (
  key_version INTEGER PRIMARY KEY CHECK (key_version BETWEEN 1 AND 999999999),
  hmac_key BYTEA NOT NULL CHECK (octet_length(hmac_key) = 32),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at IS NULL OR expires_at > activated_at),
  CHECK (revoked_at IS NULL OR revoked_at >= activated_at)
);

CREATE OR REPLACE FUNCTION tecpey_guard_ai_context_authority_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $context_key_guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AI context authority keys cannot be deleted'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.key_version IS DISTINCT FROM OLD.key_version
     OR NEW.hmac_key IS DISTINCT FROM OLD.hmac_key
     OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'AI context authority key material is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.revoked_at IS NOT NULL
     AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'AI context authority key revocation is irreversible'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.expires_at IS NOT NULL
     AND (NEW.expires_at IS NULL OR NEW.expires_at > OLD.expires_at) THEN
    RAISE EXCEPTION 'AI context authority key expiry cannot be extended'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$context_key_guard$;

DROP TRIGGER IF EXISTS tecpey_ai_context_authority_key_guard
  ON tecpey_ai_context_authority_keys;
CREATE TRIGGER tecpey_ai_context_authority_key_guard
BEFORE UPDATE OR DELETE ON tecpey_ai_context_authority_keys
FOR EACH ROW EXECUTE FUNCTION tecpey_guard_ai_context_authority_key();

REVOKE ALL ON TABLE tecpey_ai_context_authority_keys
  FROM PUBLIC, tecpey_ai_tenant_runtime, tecpey_ai_worker;
REVOKE ALL ON TABLE
  admin_users,
  admin_user_roles,
  admin_sessions,
  admin_audit_events
FROM tecpey_ai_tenant_runtime, tecpey_ai_worker;
REVOKE ALL ON FUNCTION tecpey_guard_ai_context_authority_key() FROM PUBLIC;

CREATE OR REPLACE FUNCTION tecpey_ai_authorized_context()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $authorized_context$
DECLARE
  tenant_scope TEXT := NULLIF(current_setting('tecpey.tenant_id', TRUE), '');
  workspace_scope TEXT := NULLIF(current_setting('tecpey.workspace_id', TRUE), '');
  context_kind TEXT := NULLIF(current_setting('tecpey.ai_context_kind', TRUE), '');
  key_version_text TEXT := NULLIF(
    current_setting('tecpey.ai_context_key_version', TRUE),
    ''
  );
  supplied_signature TEXT := NULLIF(
    current_setting('tecpey.ai_context_signature', TRUE),
    ''
  );
  context_key BYTEA;
  context_message TEXT;
  expected_signature TEXT;
BEGIN
  IF NOT pg_has_role(session_user, 'tecpey_ai_tenant_runtime', 'USAGE')
     OR pg_has_role(session_user, 'tecpey_ai_worker', 'USAGE')
     OR tenant_scope IS NULL
     OR workspace_scope IS NULL
     OR context_kind IS NULL
     OR key_version_text IS NULL
     OR supplied_signature IS NULL
     OR session_user !~ '^[a-z][a-z0-9_]{2,62}$'
     OR tenant_scope !~ '^[a-z][a-z0-9._-]{1,79}$'
     OR workspace_scope !~ '^[a-z][a-z0-9._-]{1,79}$'
     OR context_kind <> 'tenant_v1'
     OR key_version_text !~ '^[1-9][0-9]{0,8}$'
     OR supplied_signature !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT authority.hmac_key
    INTO context_key
    FROM public.tecpey_ai_context_authority_keys authority
   WHERE authority.key_version = key_version_text::integer
     AND authority.activated_at <= NOW()
     AND (authority.expires_at IS NULL OR authority.expires_at > NOW())
     AND authority.revoked_at IS NULL
   LIMIT 1;
  IF context_key IS NULL THEN
    RETURN NULL;
  END IF;

  context_message := concat_ws(
    E'\\n',
    'tecpey-ai-context-v1',
    key_version_text,
    context_kind,
    tenant_scope,
    workspace_scope,
    session_user,
    pg_backend_pid()::text,
    txid_current()::text
  );
  expected_signature := encode(
    public.hmac(convert_to(context_message, 'UTF8'), context_key, 'sha256'),
    'hex'
  );
  -- Compare keyed transforms rather than the raw HMAC bytes. PostgreSQL bytea
  -- equality is not specified as constant-time; this prevents a prefix-timing
  -- oracle from revealing the expected transaction signature.
  IF public.hmac(decode(expected_signature, 'hex'), context_key, 'sha256') <>
     public.hmac(decode(supplied_signature, 'hex'), context_key, 'sha256') THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_array(tenant_scope, workspace_scope);
END
$authorized_context$;

REVOKE ALL ON FUNCTION tecpey_ai_authorized_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tecpey_ai_authorized_context()
  TO tecpey_ai_tenant_runtime;

REVOKE ALL ON TABLE
  ai_provider_configs,
  ai_provider_config_events,
  ai_agent_bindings,
  ai_agent_usage_daily,
  ai_agent_binding_events,
  ai_knowledge_items,
  ai_knowledge_item_events,
  ai_workflow_run_evidence,
  ai_provider_quota_snapshots,
  ai_automation_policies,
  ai_automation_policy_events,
  ai_automation_runs,
  ai_automation_reviews,
  ai_automation_run_events,
  ai_agent_spend_monthly,
  ai_spend_reservations,
  ai_routing_decision_events,
  ai_agent_route_candidates,
  ai_agent_route_candidate_events
FROM PUBLIC, tecpey_ai_tenant_runtime, tecpey_ai_worker;

GRANT USAGE ON SCHEMA public TO tecpey_ai_tenant_runtime, tecpey_ai_worker;
GRANT SELECT ON TABLE _migration_runtime_state
  TO tecpey_ai_tenant_runtime, tecpey_ai_worker;

GRANT SELECT, INSERT, UPDATE ON TABLE
  ai_provider_configs,
  ai_agent_bindings,
  ai_agent_usage_daily,
  ai_knowledge_items,
  ai_automation_policies,
  ai_automation_runs,
  ai_agent_spend_monthly,
  ai_spend_reservations,
  ai_agent_route_candidates
TO tecpey_ai_tenant_runtime;

GRANT SELECT, INSERT ON TABLE
  ai_provider_config_events,
  ai_agent_binding_events,
  ai_knowledge_item_events,
  ai_workflow_run_evidence,
  ai_provider_quota_snapshots,
  ai_automation_policy_events,
  ai_automation_reviews,
  ai_automation_run_events,
  ai_routing_decision_events,
  ai_agent_route_candidate_events
TO tecpey_ai_tenant_runtime;

GRANT DELETE ON TABLE ai_agent_route_candidates TO tecpey_ai_tenant_runtime;

GRANT SELECT ON TABLE ai_automation_policies TO tecpey_ai_worker;
GRANT UPDATE (last_enqueued_at, next_run_at)
  ON TABLE ai_automation_policies TO tecpey_ai_worker;

GRANT SELECT ON TABLE ai_automation_runs TO tecpey_ai_worker;
GRANT INSERT (
  id, tenant_id, workspace_id, workflow_id, trigger_type, data_class,
  criticality, resource_type, input_text, input_hash, command_hash,
  idempotency_key, policy_version, ai_reviewer_ids, ai_quorum,
  manager_role_ids, manager_quorum, c_level_role_ids, c_level_quorum,
  external_effect, free_fallback_allowed, max_attempts, expires_at
) ON TABLE ai_automation_runs TO tecpey_ai_worker;
GRANT UPDATE (
  status, attempt_count, lease_owner, lease_expires_at, failure_code
) ON TABLE ai_automation_runs TO tecpey_ai_worker;
GRANT SELECT (run_id, review_kind, decision)
  ON TABLE ai_automation_reviews TO tecpey_ai_worker;
GRANT INSERT (
  tenant_id, workspace_id, run_id, event_type, from_status, to_status,
  actor_type, actor_id, metadata
) ON TABLE ai_automation_run_events TO tecpey_ai_worker;

DO $tenant_policies$
DECLARE
  relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'ai_provider_configs',
    'ai_provider_config_events',
    'ai_agent_bindings',
    'ai_agent_usage_daily',
    'ai_agent_binding_events',
    'ai_knowledge_items',
    'ai_knowledge_item_events',
    'ai_workflow_run_evidence',
    'ai_provider_quota_snapshots',
    'ai_automation_policies',
    'ai_automation_policy_events',
    'ai_automation_runs',
    'ai_automation_reviews',
    'ai_automation_run_events',
    'ai_agent_spend_monthly',
    'ai_spend_reservations',
    'ai_routing_decision_events',
    'ai_agent_route_candidates',
    'ai_agent_route_candidate_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', relation_name);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      relation_name || '_tenant_scope',
      relation_name
    );
    EXECUTE format(
      $policy$
      CREATE POLICY %I ON public.%I
        FOR ALL TO tecpey_ai_tenant_runtime
        USING (
          jsonb_build_array(tenant_id, workspace_id) =
            (SELECT tecpey_ai_authorized_context())
        )
        WITH CHECK (
          jsonb_build_array(tenant_id, workspace_id) =
            (SELECT tecpey_ai_authorized_context())
        )
      $policy$,
      relation_name || '_tenant_scope',
      relation_name
    );
  END LOOP;
END
$tenant_policies$;

DROP POLICY IF EXISTS ai_automation_policies_worker_select ON ai_automation_policies;
CREATE POLICY ai_automation_policies_worker_select ON ai_automation_policies
  FOR SELECT TO tecpey_ai_worker
  USING (NOT pg_has_role(session_user, 'tecpey_ai_tenant_runtime', 'USAGE'));
DROP POLICY IF EXISTS ai_automation_policies_worker_update ON ai_automation_policies;
CREATE POLICY ai_automation_policies_worker_update ON ai_automation_policies
  FOR UPDATE TO tecpey_ai_worker
  USING (NOT pg_has_role(session_user, 'tecpey_ai_tenant_runtime', 'USAGE'))
  WITH CHECK (NOT pg_has_role(session_user, 'tecpey_ai_tenant_runtime', 'USAGE'));

DROP POLICY IF EXISTS ai_automation_runs_worker_select ON ai_automation_runs;
CREATE POLICY ai_automation_runs_worker_select ON ai_automation_runs
  FOR SELECT TO tecpey_ai_worker
  USING (NOT pg_has_role(session_user, 'tecpey_ai_tenant_runtime', 'USAGE'));
DROP POLICY IF EXISTS ai_automation_runs_worker_insert ON ai_automation_runs;
CREATE POLICY ai_automation_runs_worker_insert ON ai_automation_runs
  FOR INSERT TO tecpey_ai_worker
  WITH CHECK (
    NOT pg_has_role(session_user, 'tecpey_ai_tenant_runtime', 'USAGE')
    AND EXISTS (
      SELECT 1
        FROM ai_automation_policies policy
       WHERE policy.tenant_id = ai_automation_runs.tenant_id
         AND policy.workspace_id = ai_automation_runs.workspace_id
         AND policy.workflow_id = ai_automation_runs.workflow_id
         AND policy.policy_version = ai_automation_runs.policy_version
         AND policy.enabled
    )
  );
DROP POLICY IF EXISTS ai_automation_runs_worker_update ON ai_automation_runs;
CREATE POLICY ai_automation_runs_worker_update ON ai_automation_runs
  FOR UPDATE TO tecpey_ai_worker
  USING (NOT pg_has_role(session_user, 'tecpey_ai_tenant_runtime', 'USAGE'))
  WITH CHECK (NOT pg_has_role(session_user, 'tecpey_ai_tenant_runtime', 'USAGE'));

DROP POLICY IF EXISTS ai_automation_reviews_worker_select ON ai_automation_reviews;
CREATE POLICY ai_automation_reviews_worker_select ON ai_automation_reviews
  FOR SELECT TO tecpey_ai_worker
  USING (NOT pg_has_role(session_user, 'tecpey_ai_tenant_runtime', 'USAGE'));

DROP POLICY IF EXISTS ai_automation_run_events_worker_insert ON ai_automation_run_events;
CREATE POLICY ai_automation_run_events_worker_insert ON ai_automation_run_events
  FOR INSERT TO tecpey_ai_worker
  WITH CHECK (
    NOT pg_has_role(session_user, 'tecpey_ai_tenant_runtime', 'USAGE')
    AND EXISTS (
      SELECT 1
        FROM ai_automation_runs run
       WHERE run.id = ai_automation_run_events.run_id
         AND run.tenant_id = ai_automation_run_events.tenant_id
         AND run.workspace_id = ai_automation_run_events.workspace_id
    )
  );

CREATE OR REPLACE VIEW tecpey_ai_active_admin_roles
WITH (security_barrier = TRUE) AS
SELECT admin_user.id AS admin_id,
       admin_user.tenant_id,
       admin_user.workspace_id,
       user_role.role_id
  FROM public.admin_users admin_user
  JOIN public.admin_user_roles user_role
    ON user_role.admin_id = admin_user.id
   AND user_role.revoked_at IS NULL
 WHERE admin_user.status = 'active'
   AND jsonb_build_array(admin_user.tenant_id, admin_user.workspace_id) =
       (SELECT tecpey_ai_authorized_context());

REVOKE ALL ON TABLE tecpey_ai_active_admin_roles FROM PUBLIC;
GRANT SELECT ON TABLE tecpey_ai_active_admin_roles TO tecpey_ai_tenant_runtime;

CREATE OR REPLACE FUNCTION tecpey_validate_ai_automation_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $review_guard$
DECLARE
  target ai_automation_runs%ROWTYPE;
  actual_roles TEXT[];
BEGIN
  SELECT * INTO target
    FROM ai_automation_runs
   WHERE id = NEW.run_id
     AND tenant_id = NEW.tenant_id
     AND workspace_id = NEW.workspace_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI automation review scope mismatch'
      USING ERRCODE = '23503';
  END IF;
  IF target.status IN (
       'approved', 'executing', 'completed', 'rejected', 'blocked', 'failed', 'cancelled'
     ) OR target.expires_at <= NOW() THEN
    RAISE EXCEPTION 'AI automation run is not reviewable'
      USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM ai_automation_policies policy
     WHERE policy.tenant_id = target.tenant_id
       AND policy.workspace_id = target.workspace_id
       AND policy.workflow_id = target.workflow_id
       AND policy.enabled
       AND policy.policy_version = target.policy_version
  ) THEN
    RAISE EXCEPTION 'AI automation policy is disabled or superseded'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.review_kind = 'ai_agent' AND (
       target.status <> 'ai_review'
       OR target.lease_owner IS DISTINCT FROM NEW.reviewer_worker_id
       OR target.lease_expires_at IS NULL
       OR target.lease_expires_at <= NOW()
     ) THEN
    RAISE EXCEPTION 'AI automation review lease is invalid'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.review_kind = 'manager' AND target.status <> 'manager_review' THEN
    RAISE EXCEPTION 'AI automation manager review is outside its gate'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.review_kind = 'c_level' AND target.status <> 'c_level_review' THEN
    RAISE EXCEPTION 'AI automation C-level review is outside its gate'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.reviewer_admin_id IS NOT NULL
     AND NEW.reviewer_admin_id = target.requested_by THEN
    RAISE EXCEPTION 'AI automation requester cannot approve own run'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.reviewer_admin_id IS NOT NULL THEN
    SELECT COALESCE(
             array_agg(DISTINCT scoped_role.role_id ORDER BY scoped_role.role_id),
             '{}'::text[]
           )
      INTO actual_roles
      FROM tecpey_ai_active_admin_roles scoped_role
     WHERE scoped_role.admin_id = NEW.reviewer_admin_id;
    IF cardinality(actual_roles) = 0 THEN
      RAISE EXCEPTION 'AI automation human reviewer is not active in scope'
        USING ERRCODE = '42501';
    END IF;
    NEW.reviewer_roles := actual_roles;
  END IF;
  IF NEW.review_kind = 'ai_agent'
     AND NOT (NEW.reviewer_agent_id = ANY(target.ai_reviewer_ids)) THEN
    RAISE EXCEPTION 'AI reviewer is outside policy snapshot'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.review_kind = 'manager'
     AND NOT (NEW.reviewer_roles && target.manager_role_ids) THEN
    RAISE EXCEPTION 'Manager reviewer role is outside policy snapshot'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.review_kind = 'c_level'
     AND NOT (NEW.reviewer_roles && target.c_level_role_ids) THEN
    RAISE EXCEPTION 'C-level reviewer role is outside policy snapshot'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$review_guard$;

REVOKE ALL ON FUNCTION tecpey_validate_ai_automation_review() FROM PUBLIC;

CREATE OR REPLACE FUNCTION tecpey_ai_lock_admin_audit_head()
RETURNS TABLE(event_id UUID, previous_hash TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $audit_head$
DECLARE
  latest_hash TEXT;
BEGIN
  IF NOT pg_has_role(session_user, 'tecpey_ai_tenant_runtime', 'USAGE')
     OR pg_has_role(session_user, 'tecpey_ai_worker', 'USAGE') THEN
    RAISE EXCEPTION 'AI tenant audit role is not authorized'
      USING ERRCODE = '42501';
  END IF;
  IF tecpey_ai_authorized_context() IS NULL THEN
    RAISE EXCEPTION 'AI tenant audit context is missing'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tecpey_admin_audit_chain'));
  SELECT audit.event_hash
    INTO latest_hash
    FROM public.admin_audit_events audit
   ORDER BY audit.chain_sequence DESC
   LIMIT 1;
  RETURN QUERY SELECT gen_random_uuid(), latest_hash, clock_timestamp();
END
$audit_head$;

CREATE OR REPLACE FUNCTION tecpey_ai_append_admin_audit(
  p_event_id UUID,
  p_created_at TIMESTAMPTZ,
  p_actor_admin_id UUID,
  p_session_id UUID,
  p_effective_roles JSONB,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT,
  p_request_id TEXT,
  p_source_ip TEXT,
  p_user_agent TEXT,
  p_reason TEXT,
  p_before_state JSONB,
  p_after_state JSONB,
  p_outcome TEXT,
  p_error_code TEXT,
  p_previous_hash TEXT,
  p_event_hash TEXT
)
RETURNS TABLE(event_id UUID, event_hash TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $audit_append$
DECLARE
  authorized_scope JSONB;
  tenant_scope TEXT;
  workspace_scope TEXT;
  latest_hash TEXT;
  actual_effective_roles JSONB;
BEGIN
  IF NOT pg_has_role(session_user, 'tecpey_ai_tenant_runtime', 'USAGE')
     OR pg_has_role(session_user, 'tecpey_ai_worker', 'USAGE') THEN
    RAISE EXCEPTION 'AI tenant audit role is not authorized'
      USING ERRCODE = '42501';
  END IF;
  authorized_scope := tecpey_ai_authorized_context();
  tenant_scope := authorized_scope ->> 0;
  workspace_scope := authorized_scope ->> 1;
  IF authorized_scope IS NULL OR tenant_scope IS NULL OR workspace_scope IS NULL THEN
    RAISE EXCEPTION 'AI tenant audit context is missing'
      USING ERRCODE = '42501';
  END IF;
  IF p_event_id IS NULL
     OR p_created_at IS NULL
     OR ABS(EXTRACT(EPOCH FROM (clock_timestamp() - p_created_at))) > 30
     OR p_actor_admin_id IS NULL
     OR p_session_id IS NULL
     OR p_action !~ '^ai(?:_|\\.)[a-z0-9_.:-]{2,119}$'
     OR p_resource_type !~ '^ai_[a-z0-9_:-]{2,79}$'
     OR p_outcome NOT IN ('success', 'denied', 'failed')
     OR p_event_hash !~ '^[0-9a-f]{64}$'
     OR (p_previous_hash IS NOT NULL AND p_previous_hash !~ '^[0-9a-f]{64}$')
     OR p_effective_roles IS NULL
     OR jsonb_typeof(p_effective_roles) <> 'array'
     OR octet_length(p_effective_roles::text) > 8192
     OR (p_before_state IS NOT NULL AND octet_length(p_before_state::text) > 65536)
     OR (p_after_state IS NOT NULL AND octet_length(p_after_state::text) > 65536) THEN
    RAISE EXCEPTION 'AI tenant audit payload is invalid'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.admin_users admin_user
     WHERE admin_user.id = p_actor_admin_id
       AND admin_user.tenant_id = tenant_scope
       AND admin_user.workspace_id = workspace_scope
       AND admin_user.status = 'active'
  ) OR NOT EXISTS (
    SELECT 1
      FROM public.admin_sessions session
     WHERE session.id = p_session_id
       AND session.admin_id = p_actor_admin_id
       AND session.revoked_at IS NULL
       AND session.permission_version = (
         SELECT admin_user.permission_version
           FROM public.admin_users admin_user
          WHERE admin_user.id = p_actor_admin_id
       )
       AND session.idle_expires_at > NOW()
       AND session.absolute_expires_at > NOW()
  ) THEN
    RAISE EXCEPTION 'AI tenant audit actor is outside scope'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements_text(p_effective_roles) supplied(role_id)
     WHERE supplied.role_id !~ '^[a-z][a-z0-9._:-]{1,79}$'
  ) THEN
    RAISE EXCEPTION 'AI tenant audit effective roles are invalid'
      USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(
           jsonb_agg(assigned.role_id ORDER BY assigned.role_id),
           '[]'::jsonb
         )
    INTO actual_effective_roles
    FROM public.admin_user_roles assigned
   WHERE assigned.admin_id = p_actor_admin_id
     AND assigned.revoked_at IS NULL;
  IF p_effective_roles IS DISTINCT FROM actual_effective_roles THEN
    RAISE EXCEPTION 'AI tenant audit effective roles are not exact'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tecpey_admin_audit_chain'));
  SELECT audit.event_hash
    INTO latest_hash
    FROM public.admin_audit_events audit
   ORDER BY audit.chain_sequence DESC
   LIMIT 1;
  IF latest_hash IS DISTINCT FROM p_previous_hash THEN
    RAISE EXCEPTION 'admin_audit_chain_conflict'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.admin_audit_events (
    id, actor_admin_id, session_id, effective_roles, action, resource_type,
    resource_id, request_id, source_ip, user_agent, reason, before_state,
    after_state, outcome, error_code, previous_hash, event_hash, created_at
  ) VALUES (
    p_event_id, p_actor_admin_id, p_session_id, p_effective_roles,
    p_action, p_resource_type, p_resource_id, p_request_id, p_source_ip,
    p_user_agent, p_reason, p_before_state, p_after_state, p_outcome,
    p_error_code, p_previous_hash, p_event_hash, p_created_at
  );

  RETURN QUERY SELECT p_event_id, p_event_hash, p_created_at;
END
$audit_append$;

REVOKE ALL ON FUNCTION tecpey_ai_lock_admin_audit_head() FROM PUBLIC;
REVOKE ALL ON FUNCTION tecpey_ai_append_admin_audit(
  UUID, TIMESTAMPTZ, UUID, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tecpey_ai_lock_admin_audit_head()
  TO tecpey_ai_tenant_runtime;
GRANT EXECUTE ON FUNCTION tecpey_ai_append_admin_audit(
  UUID, TIMESTAMPTZ, UUID, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT
) TO tecpey_ai_tenant_runtime;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAiTenantRlsMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(AI_TENANT_RLS_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-ai-tenant-rls] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-ai-tenant-rls] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(AI_TENANT_RLS_SQL);
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
