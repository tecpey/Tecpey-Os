import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withAiTenantTransaction } from "../../lib/ai/database-authority";

const DATABASE_BOUNDARY_ENVIRONMENT = [
  "NODE_ENV",
  "TECPEY_AI_TENANT_DATABASE_URL",
  "TECPEY_AI_WORKER_DATABASE_URL",
  "TECPEY_AI_CONTEXT_HMAC_KEY_B64",
  "TECPEY_AI_CONTEXT_HMAC_KEY_VERSION",
  "TECPEY_DATABASE_MIGRATION_URL",
  "TECPEY_DATABASE_PROCESS_ROLE",
] as const;

const testScope = {
  tenantId: "authority-test",
  workspaceId: "workspace-test",
} as const;

function restoreEnvironment(
  snapshot: Readonly<
    Record<(typeof DATABASE_BOUNDARY_ENVIRONMENT)[number], string | undefined>
  >,
): void {
  for (const name of DATABASE_BOUNDARY_ENVIRONMENT) {
    const value = snapshot[name];
    if (value === undefined) Reflect.deleteProperty(process.env, name);
    else Reflect.set(process.env, name, value);
  }
}

describe("AI database configuration authority", () => {
  it("distinguishes an intentionally absent authority from partial configuration", async () => {
    const snapshot = Object.fromEntries(
      DATABASE_BOUNDARY_ENVIRONMENT.map((name) => [name, process.env[name]]),
    ) as Record<(typeof DATABASE_BOUNDARY_ENVIRONMENT)[number], string | undefined>;

    try {
      for (const name of DATABASE_BOUNDARY_ENVIRONMENT) {
        Reflect.deleteProperty(process.env, name);
      }
      Reflect.set(process.env, "NODE_ENV", "test");
      const absent = await withAiTenantTransaction(testScope, async () => true);
      assert.deepEqual(absent, { enabled: false, value: null });

      process.env.TECPEY_AI_TENANT_DATABASE_URL =
        "postgresql://tenant-runtime:fixture-password@127.0.0.1:1/fixture";
      await assert.rejects(
        () => withAiTenantTransaction(testScope, async () => true),
        /ai_tenant_database_configuration_incomplete/u,
      );

      Reflect.deleteProperty(process.env, "TECPEY_AI_TENANT_DATABASE_URL");
      process.env.TECPEY_AI_CONTEXT_HMAC_KEY_B64 = Buffer.alloc(32, 17).toString(
        "base64",
      );
      process.env.TECPEY_AI_CONTEXT_HMAC_KEY_VERSION = "1";
      await assert.rejects(
        () => withAiTenantTransaction(testScope, async () => true),
        /ai_tenant_database_configuration_incomplete/u,
      );

      Reflect.deleteProperty(process.env, "TECPEY_AI_CONTEXT_HMAC_KEY_VERSION");
      await assert.rejects(
        () => withAiTenantTransaction(testScope, async () => true),
        /ai_tenant_context_authority_invalid/u,
      );

      process.env.TECPEY_AI_CONTEXT_HMAC_KEY_VERSION = "1";
      process.env.TECPEY_AI_TENANT_DATABASE_URL =
        "postgresql://tenant-runtime:fixture-password@127.0.0.1:1/fixture";
      Reflect.set(process.env, "NODE_ENV", "production");
      process.env.TECPEY_AI_WORKER_DATABASE_URL =
        "postgresql://worker-runtime:fixture-password@127.0.0.1:1/fixture";
      await assert.rejects(
        () => withAiTenantTransaction(testScope, async () => true),
        /ai_worker_database_credential_exposed_to_web_runtime/u,
      );

      Reflect.deleteProperty(process.env, "TECPEY_AI_WORKER_DATABASE_URL");
      process.env.TECPEY_DATABASE_MIGRATION_URL =
        "postgresql://migration-owner:fixture-password@127.0.0.1:1/fixture";
      await assert.rejects(
        () => withAiTenantTransaction(testScope, async () => true),
        /ai_migration_database_credential_exposed_to_runtime/u,
      );
    } finally {
      restoreEnvironment(snapshot);
    }
  });
});
