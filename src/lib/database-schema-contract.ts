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
