import type { PoolClient } from "pg";

export const ACADEMY_V3_DECISION_INVARIANT_INDEX =
  "academy_v3_mission_decision_events_attempt_uidx" as const;

export const ACADEMY_V3_DECISION_INVARIANT_SQL = String.raw`
DO $$
DECLARE
  duplicate_group_count bigint;
  existing_index_count integer;
  valid_index_count integer;
BEGIN
  SELECT count(*)
    INTO duplicate_group_count
    FROM (
      SELECT 1
        FROM academy_v3_mission_decision_events
       GROUP BY tenant_id, workspace_id, attempt_id
      HAVING count(*) > 1
    ) duplicates;

  IF duplicate_group_count > 0 THEN
    RAISE EXCEPTION 'academy_v3_decision_invariant_duplicate_preflight:%', duplicate_group_count
      USING ERRCODE = '23505';
  END IF;

  SELECT count(*)
    INTO existing_index_count
    FROM pg_class index_relation
    JOIN pg_namespace index_namespace
      ON index_namespace.oid = index_relation.relnamespace
   WHERE index_relation.relkind = 'i'
     AND index_relation.relname = 'academy_v3_mission_decision_events_attempt_uidx'
     AND index_namespace.nspname = current_schema();

  IF existing_index_count > 0 THEN
    SELECT count(*)
      INTO valid_index_count
      FROM pg_index index_metadata
      JOIN pg_class index_relation
        ON index_relation.oid = index_metadata.indexrelid
      JOIN pg_class table_relation
        ON table_relation.oid = index_metadata.indrelid
      JOIN pg_namespace table_namespace
        ON table_namespace.oid = table_relation.relnamespace
     WHERE index_relation.relname = 'academy_v3_mission_decision_events_attempt_uidx'
       AND table_relation.relname = 'academy_v3_mission_decision_events'
       AND table_namespace.nspname = current_schema()
       AND index_metadata.indisunique
       AND index_metadata.indisvalid
       AND index_metadata.indisready
       AND index_metadata.indpred IS NULL
       AND index_metadata.indexprs IS NULL
       AND index_metadata.indnkeyatts = 3
       AND (
         SELECT array_agg(attribute.attname ORDER BY key.ordinality)
           FROM unnest(index_metadata.indkey::smallint[]) WITH ORDINALITY AS key(attnum, ordinality)
           JOIN pg_attribute attribute
             ON attribute.attrelid = table_relation.oid
            AND attribute.attnum = key.attnum
          WHERE key.ordinality <= index_metadata.indnkeyatts
       ) = ARRAY['tenant_id', 'workspace_id', 'attempt_id']::name[];

    IF valid_index_count <> 1 THEN
      RAISE EXCEPTION 'academy_v3_decision_invariant_index_drift'
        USING ERRCODE = '55000';
    END IF;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS academy_v3_mission_decision_events_attempt_uidx
  ON academy_v3_mission_decision_events (tenant_id, workspace_id, attempt_id);

DO $$
DECLARE
  valid_index_count integer;
BEGIN
  SELECT count(*)
    INTO valid_index_count
    FROM pg_index index_metadata
    JOIN pg_class index_relation
      ON index_relation.oid = index_metadata.indexrelid
    JOIN pg_class table_relation
      ON table_relation.oid = index_metadata.indrelid
    JOIN pg_namespace table_namespace
      ON table_namespace.oid = table_relation.relnamespace
   WHERE index_relation.relname = 'academy_v3_mission_decision_events_attempt_uidx'
     AND table_relation.relname = 'academy_v3_mission_decision_events'
     AND table_namespace.nspname = current_schema()
     AND index_metadata.indisunique
     AND index_metadata.indisvalid
     AND index_metadata.indisready
     AND index_metadata.indpred IS NULL
     AND index_metadata.indexprs IS NULL
     AND index_metadata.indnkeyatts = 3
     AND (
       SELECT array_agg(attribute.attname ORDER BY key.ordinality)
         FROM unnest(index_metadata.indkey::smallint[]) WITH ORDINALITY AS key(attnum, ordinality)
         JOIN pg_attribute attribute
           ON attribute.attrelid = table_relation.oid
          AND attribute.attnum = key.attnum
        WHERE key.ordinality <= index_metadata.indnkeyatts
     ) = ARRAY['tenant_id', 'workspace_id', 'attempt_id']::name[];

  IF valid_index_count <> 1 THEN
    RAISE EXCEPTION 'academy_v3_decision_invariant_postcondition_failed'
      USING ERRCODE = '55000';
  END IF;
END
$$;
`;

export async function runAcademyV3DecisionInvariantMigrations(client: PoolClient): Promise<void> {
  await client.query(ACADEMY_V3_DECISION_INVARIANT_SQL);
}
