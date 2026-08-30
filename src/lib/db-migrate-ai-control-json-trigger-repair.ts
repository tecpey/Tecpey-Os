import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0093_ai_control_json_trigger_repair.sql";

export const AI_CONTROL_JSON_TRIGGER_REPAIR_SQL = `
CREATE OR REPLACE FUNCTION tecpey_validate_ai_control_json()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  candidate JSONB;
  row_document JSONB;
BEGIN
  row_document := to_jsonb(NEW);
  candidate := CASE TG_TABLE_NAME
    WHEN 'ai_provider_configs' THEN row_document -> 'settings'
    WHEN 'ai_provider_config_events' THEN row_document -> 'settings_snapshot'
    WHEN 'ai_agent_binding_events' THEN row_document -> 'limits_snapshot'
    WHEN 'ai_knowledge_item_events' THEN row_document -> 'metadata'
    ELSE '{}'::jsonb
  END;
  candidate := COALESCE(candidate, '{}'::jsonb);
  IF tecpey_sensitive_audit_has_forbidden_key(candidate) THEN
    RAISE EXCEPTION 'AI control plane JSON contains forbidden keys'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAiControlJsonTriggerRepairMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(AI_CONTROL_JSON_TRIGGER_REPAIR_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );

  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-ai-control-json-trigger-repair] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(AI_CONTROL_JSON_TRIGGER_REPAIR_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("[db-migrate-ai-control-json-trigger-repair] migration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
