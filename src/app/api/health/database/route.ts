import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  const result = await withDb(async (client) => {
    const row = await client.query("SELECT 1 AS ok");
    return row.rows[0]?.ok === 1;
  });
  const latencyMs = Date.now() - start;

  if (!result.enabled) {
    return apiError("database_not_configured", 503, { database: "not_configured", latencyMs }, { "Cache-Control": "no-store" });
  }

  return apiOk({ database: "connected", latencyMs }, 200, { "Cache-Control": "no-store" });
}
