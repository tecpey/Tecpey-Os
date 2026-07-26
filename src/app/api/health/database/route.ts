import { checkDbHealth } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkDbHealth();
  const schemaStatus = result.schema?.status ?? "unavailable";

  if (result.status !== "ok" || schemaStatus !== "current") {
    return apiError("database_not_ready", 503, {
      database: result.status,
      schema: schemaStatus,
      migrationsApplied: result.schema?.applied ?? null,
      migrationsExpected: result.schema?.expected ?? null,
      migrationPlanHash: result.schema?.planHash ?? null,
      migrationRunnerId: result.schema?.runnerId ?? null,
      migrationErrorCode: result.schema?.errorCode ?? null,
      latencyMs: result.latencyMs,
    }, { "Cache-Control": "no-store" });
  }

  return apiOk({
    database: "connected",
    schema: "current",
    migrationsApplied: result.schema?.applied ?? null,
    migrationsExpected: result.schema?.expected ?? null,
    latencyMs: result.latencyMs,
  }, 200, { "Cache-Control": "no-store" });
}
