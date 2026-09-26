import type { PoolClient } from "pg";

export const ACADEMY_V3_DECISION_INVARIANT_SQL = String.raw`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM academy_v3_mission_decision_events
     GROUP BY tenant_id, workspace_id, attempt_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'academy_v3_decision_invariant_duplicate_preflight';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS academy_v3_mission_decision_events_attempt_uidx
  ON academy_v3_mission_decision_events (tenant_id, workspace_id, attempt_id);
`;

export async function runAcademyV3DecisionInvariantMigrations(client: PoolClient): Promise<void> {
  await client.query(ACADEMY_V3_DECISION_INVARIANT_SQL);
}
