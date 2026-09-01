import { createHash } from "node:crypto";

export type SchemaQueryable = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export async function assertRequiredDatabaseTables(
  client: SchemaQueryable,
  tableNames: readonly string[],
  contract: string,
): Promise<void> {
  const result = await client.query(
    `SELECT table_name, to_regclass('public.' || table_name)::text AS identity
       FROM unnest($1::text[]) AS table_name`,
    [tableNames],
  );
  const missing = result.rows
    .filter((row) => row.identity === null)
    .map((row) => String((row as { table_name?: string }).table_name ?? "unknown"));
  if (missing.length > 0) {
    throw new Error(`database_schema_contract_missing:${contract}:${missing.join(",")}`);
  }
}

export async function databaseSchemaFingerprint(client: SchemaQueryable): Promise<string> {
  const result = await client.query(
    `SELECT object_type, identity, definition
       FROM (
         SELECT 'column' AS object_type,
                table_name || '.' || column_name AS identity,
                concat_ws('|', column_name, data_type, udt_name, is_nullable, column_default, collation_name) AS definition
           FROM information_schema.columns WHERE table_schema = 'public'
         UNION ALL
         SELECT 'constraint', c.conrelid::regclass::text || '.' || c.conname,
                pg_get_constraintdef(c.oid, true)
           FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
          WHERE n.nspname = 'public'
         UNION ALL
         SELECT 'index', indexname, indexdef
           FROM pg_indexes WHERE schemaname = 'public'
         UNION ALL
         SELECT 'trigger', event_object_table || '.' || trigger_name,
                action_timing || '|' || event_manipulation || '|' || action_statement
           FROM information_schema.triggers WHERE trigger_schema = 'public'
         UNION ALL
         SELECT 'function', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
         UNION ALL
         SELECT 'view', viewname, definition
           FROM pg_views WHERE schemaname = 'public'
         UNION ALL
         SELECT 'sequence', sequence_name,
                concat_ws('|', data_type, start_value, minimum_value, maximum_value, increment, cycle_option)
           FROM information_schema.sequences WHERE sequence_schema = 'public'
       ) AS governed_schema
      ORDER BY object_type, identity, definition`,
  );
  return createHash("sha256").update(JSON.stringify(result.rows)).digest("hex");
}
