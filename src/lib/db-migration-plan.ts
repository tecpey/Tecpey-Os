import type { PoolClient } from "pg";
import { runMigrations } from "./db-migrate";
import { runCompatibilityMigrations } from "./db-migrate-compat";
import { runUserStateMigrations } from "./db-migrate-user-state";
import { runAdminControlPlaneMigrations } from "./db-migrate-admin-control-plane";
import { runAdminControlPlaneHardeningMigrations } from "./db-migrate-admin-control-plane-hardening";
import { runNotificationMigrations } from "./db-migrate-notifications";
import { runNotificationRuntimeMigrations } from "./db-migrate-notification-runtime";
import { runNotificationDeliveryVisibilityMigrations } from "./db-migrate-notification-delivery-visibility";
import { runOfflineSyncMigrations } from "./db-migrate-offline-sync";
import { runNotificationDomainOutboxMigrations } from "./db-migrate-notification-domain-outbox";
import { runCrmLeadMigrations } from "./db-migrate-crm-leads";
import { runCrmLeadHardeningMigrations } from "./db-migrate-crm-leads-hardening";
import { runAcademyProgressHardeningMigrations } from "./db-migrate-academy-progress-hardening";
import { runExchangeOrderAdmissionMigrations } from "./db-migrate-exchange-order-admission";
import { runExchangeOrderEvidenceMigrations } from "./db-migrate-exchange-order-evidence";
import { runExchangeOrderFinalEvidenceGateMigrations } from "./db-migrate-exchange-order-final-evidence-gate";
import { runWithdrawalAdmissionMigrations } from "./db-migrate-withdrawal-admission";
import { runWithdrawalSettlementMigrations } from "./db-migrate-withdrawal-settlement";
import { runWithdrawalPrebroadcastEvidenceMigrations } from "./db-migrate-withdrawal-prebroadcast-evidence";
import { runWithdrawalAdminEvidenceHardeningMigrations } from "./db-migrate-withdrawal-admin-evidence-hardening";
import { runWithdrawalPrebroadcastTransitionGateMigrations } from "./db-migrate-withdrawal-prebroadcast-transition-gate";
import { runWithdrawalExternalEffectEvidenceMigrations } from "./db-migrate-withdrawal-external-effect-evidence";
import { runWithdrawalExternalEffectGateMigrations } from "./db-migrate-withdrawal-external-effect-gate";
import { runWithdrawalExternalEffectGateAmountCastMigrations } from "./db-migrate-withdrawal-external-effect-gate-amount-cast";
import { runRiskEnforcementAuthorityMigrations } from "./db-migrate-risk-enforcement-authority";
import { runTenantPrincipalIsolationMigrations } from "./db-migrate-tenant-principal-isolation";
import { runApiCommandIdempotencyMigrations } from "./db-migrate-api-command-idempotency";
import { runSensitiveMutationAuditMigrations } from "./db-migrate-sensitive-mutation-audit";
import { runSessionAuthorityMigrations } from "./db-migrate-session-authority";
import { runSessionLegacyFallbackMigrations } from "./db-migrate-session-legacy-fallback";
import { runAiMentorTrustMigrations } from "./db-migrate-ai-mentor-trust";

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
  await runOfflineSyncMigrations(client);
  await runNotificationDomainOutboxMigrations(client);
  await runCrmLeadMigrations(client);
  await runCrmLeadHardeningMigrations(client);
  await runAcademyProgressHardeningMigrations(client);
  await runExchangeOrderAdmissionMigrations(client);
  await runWithdrawalAdmissionMigrations(client);
  await runWithdrawalSettlementMigrations(client);
  await runApiCommandIdempotencyMigrations(client);
  await runSensitiveMutationAuditMigrations(client);
  await runExchangeOrderEvidenceMigrations(client);
  await runExchangeOrderFinalEvidenceGateMigrations(client);
  await runWithdrawalPrebroadcastEvidenceMigrations(client);
  await runWithdrawalAdminEvidenceHardeningMigrations(client);
  await runWithdrawalPrebroadcastTransitionGateMigrations(client);
  await runWithdrawalExternalEffectEvidenceMigrations(client);
  await runWithdrawalExternalEffectGateMigrations(client);
  await runWithdrawalExternalEffectGateAmountCastMigrations(client);
  await runRiskEnforcementAuthorityMigrations(client);
  await runTenantPrincipalIsolationMigrations(client);
  await runSessionAuthorityMigrations(client);
  await runSessionLegacyFallbackMigrations(client);
  await runAiMentorTrustMigrations(client);
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
