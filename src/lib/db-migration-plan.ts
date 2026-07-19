import type { PoolClient } from "pg";
import { runMigrations } from "./db-migrate";
import { runCompatibilityMigrations } from "./db-migrate-compat";
import { runUserStateMigrations } from "./db-migrate-user-state";
import { runAdminControlPlaneMigrations } from "./db-migrate-admin-control-plane";
import { runAdminControlPlaneHardeningMigrations } from "./db-migrate-admin-control-plane-hardening";
import { runNotificationMigrations } from "./db-migrate-notifications";
import { runNotificationRuntimeMigrations } from "./db-migrate-notification-runtime";
import { runNotificationDeliveryVisibilityMigrations } from "./db-migrate-notification-delivery-visibility";
import { runWithdrawalAdmissionMigrations } from "./db-migrate-withdrawal-admission";

export const DATABASE_MIGRATION_LOCK_NAME = "tecpey_schema_migrations";

/**
 * The executable migration authority. Keep every caller on this function so
 * startup, CI and deployment tooling cannot silently drift in ordering.
 */
export async function applyDatabaseMigrations(client: PoolClient): Promise<void> {
  await runMigrations(client);
  await runCompatibilityMigrations(client);
  await runUserStateMigrations(client);
  await runAdminControlPlaneMigrations(client);
  await runAdminControlPlaneHardeningMigrations(client);
  await runNotificationMigrations(client);
  await runNotificationRuntimeMigrations(client);
  await runNotificationDeliveryVisibilityMigrations(client);
  await runWithdrawalAdmissionMigrations(client);
}

/**
 * Serialize migration runners across application and deployment processes.
 * The lock is session-scoped and remains held across each migration's own
 * transaction until the complete canonical plan succeeds or fails.
 */
export async function applyDatabaseMigrationsWithLock(client: PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_lock(hashtext($1))", [DATABASE_MIGRATION_LOCK_NAME]);
  try {
    await applyDatabaseMigrations(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [DATABASE_MIGRATION_LOCK_NAME]);
  }
}
