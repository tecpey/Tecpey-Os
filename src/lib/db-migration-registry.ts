import { createHash } from "node:crypto";
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
import { runCommunityProfileConsentMigrations } from "./db-migrate-community-profile-consent";
import { runCommunityJournalChallengeMigrations } from "./db-migrate-community-journal-challenge";
import { runCommunityJournalChallengeFinalizationMigrations } from "./db-migrate-community-journal-challenge-finalization";
import { runOperationalJobEvidenceMigrations } from "./db-migrate-operational-job-evidence";
import { runCommunityReputationEvidenceMigrations } from "./db-migrate-community-reputation-evidence";
import { runCommunityReputationScoringConsentMigrations } from "./db-migrate-community-reputation-scoring-consent";
import { runApiCommandIdempotencyMigrations } from "./db-migrate-api-command-idempotency";
import { runSensitiveMutationAuditMigrations } from "./db-migrate-sensitive-mutation-audit";
import { runSessionAuthorityMigrations } from "./db-migrate-session-authority";
import { runSessionLegacyFallbackMigrations } from "./db-migrate-session-legacy-fallback";
import { runAiMentorTrustMigrations } from "./db-migrate-ai-mentor-trust";

export type MigrationRegistryEntry = Readonly<{
  sequence: number;
  id: string;
  filenames: readonly string[];
  dependsOn: readonly string[];
  run: (client: PoolClient) => Promise<void>;
}>;

const entry = (
  sequence: number,
  id: string,
  filenames: readonly string[],
  run: MigrationRegistryEntry["run"],
): MigrationRegistryEntry => ({
  sequence,
  id,
  filenames,
  dependsOn: sequence === 1 ? [] : [`migration-step-${String(sequence - 1).padStart(3, "0")}`],
  run,
});

export const DATABASE_MIGRATION_REGISTRY = [
  entry(1, "migration-step-001", [
    "0001_initial_schema.sql", "0002_extended_schema.sql", "0003_tenant_membership.sql",
    "0004_trading_core.sql", "0005_wallet_balances.sql", "0006_spot_trading_indexes.sql",
    "0007_security.sql", "0009_identity_security.sql", "0010_withdrawals.sql",
    "0011_withdrawal_execution.sql", "0008_auth_hardening.sql",
    "0002_withdrawal_ledger_idempotency.sql",
  ], runMigrations),
  entry(2, "migration-step-002", ["0012_academy_runtime_schema_repair.sql"], runCompatibilityMigrations),
  entry(3, "migration-step-003", [
    "0013_authoritative_academy_state.sql", "0014_academy_learning_memory.sql",
    "0015_academy_reflection_memory.sql", "0016_trading_arena_account.sql",
    "0017_academy_lesson_progress.sql", "0020_trading_arena_execution.sql",
    "0021_academy_progress_authority.sql", "0022_trading_arena_reflections.sql",
  ], runUserStateMigrations),
  entry(4, "migration-step-004", ["0018_admin_control_plane_foundation.sql"], runAdminControlPlaneMigrations),
  entry(5, "migration-step-005", ["0019_admin_control_plane_hardening.sql"], runAdminControlPlaneHardeningMigrations),
  entry(6, "migration-step-006", ["0020_intelligent_notification_persistence.sql"], runNotificationMigrations),
  entry(7, "migration-step-007", ["0021_notification_creation_outbox_runtime.sql"], runNotificationRuntimeMigrations),
  entry(8, "migration-step-008", ["0022_notification_delivery_visibility.sql"], runNotificationDeliveryVisibilityMigrations),
  entry(9, "migration-step-009", ["0023_offline_sync_command_authority.sql"], runOfflineSyncMigrations),
  entry(10, "migration-step-010", ["0024_notification_domain_outbox.sql"], runNotificationDomainOutboxMigrations),
  entry(11, "migration-step-011", ["0025_crm_lead_authority.sql"], runCrmLeadMigrations),
  entry(12, "migration-step-012", ["0026_crm_lead_hardening.sql"], runCrmLeadHardeningMigrations),
  entry(13, "migration-step-013", ["0027_academy_progress_authority_v2.sql"], runAcademyProgressHardeningMigrations),
  entry(14, "migration-step-014", ["0027_exchange_order_admission_authority.sql"], runExchangeOrderAdmissionMigrations),
  entry(15, "migration-step-015", ["0030_withdrawal_admission_authority.sql"], runWithdrawalAdmissionMigrations),
  entry(16, "migration-step-016", ["0031_withdrawal_settlement_authority.sql"], runWithdrawalSettlementMigrations),
  entry(17, "migration-step-017", ["0032_api_command_idempotency.sql"], runApiCommandIdempotencyMigrations),
  entry(18, "migration-step-018", ["0033_sensitive_mutation_audit.sql"], runSensitiveMutationAuditMigrations),
  entry(19, "migration-step-019", ["0037_exchange_order_transactional_evidence.sql"], runExchangeOrderEvidenceMigrations),
  entry(20, "migration-step-020", ["0038_exchange_order_final_evidence_gate.sql"], runExchangeOrderFinalEvidenceGateMigrations),
  entry(21, "migration-step-021", ["0039_withdrawal_prebroadcast_evidence.sql"], runWithdrawalPrebroadcastEvidenceMigrations),
  entry(22, "migration-step-022", ["0040_withdrawal_admin_evidence_hardening.sql"], runWithdrawalAdminEvidenceHardeningMigrations),
  entry(23, "migration-step-023", ["0041_withdrawal_prebroadcast_transition_gate.sql"], runWithdrawalPrebroadcastTransitionGateMigrations),
  entry(24, "migration-step-024", ["0042_withdrawal_external_effect_evidence.sql"], runWithdrawalExternalEffectEvidenceMigrations),
  entry(25, "migration-step-025", ["0043_withdrawal_external_effect_gate.sql"], runWithdrawalExternalEffectGateMigrations),
  entry(26, "migration-step-026", ["0044_withdrawal_external_effect_gate_amount_cast.sql"], runWithdrawalExternalEffectGateAmountCastMigrations),
  entry(27, "migration-step-027", ["0045_risk_enforcement_authority.sql"], runRiskEnforcementAuthorityMigrations),
  entry(28, "migration-step-028", ["0046_tenant_principal_isolation_foundation.sql"], runTenantPrincipalIsolationMigrations),
  entry(29, "migration-step-029", ["0047_community_profile_consent_authority.sql"], runCommunityProfileConsentMigrations),
  entry(30, "migration-step-030", ["0048_community_journal_reflection_challenge.sql"], runCommunityJournalChallengeMigrations),
  entry(31, "migration-step-031", ["0049_community_journal_challenge_finalization.sql"], runCommunityJournalChallengeFinalizationMigrations),
  entry(32, "migration-step-032", ["0050_operational_job_evidence.sql"], runOperationalJobEvidenceMigrations),
  entry(33, "migration-step-033", ["0051_community_reputation_evidence.sql"], runCommunityReputationEvidenceMigrations),
  entry(34, "migration-step-034", ["0052_community_reputation_scoring_consent.sql"], runCommunityReputationScoringConsentMigrations),
  entry(35, "migration-step-035", ["0035_session_authority.sql"], runSessionAuthorityMigrations),
  entry(36, "migration-step-036", ["0036_session_legacy_unbound_fallback.sql"], runSessionLegacyFallbackMigrations),
  entry(37, "migration-step-037", ["0034_ai_mentor_trust_boundary.sql"], runAiMentorTrustMigrations),
] as const satisfies readonly MigrationRegistryEntry[];

export function validateMigrationRegistry(
  registry: readonly MigrationRegistryEntry[] = DATABASE_MIGRATION_REGISTRY,
): void {
  const ids = new Set<string>();
  const sequences = new Set<number>();
  const filenames = new Set<string>();
  const seenIds = new Set<string>();

  for (const [index, migration] of registry.entries()) {
    const expectedSequence = index + 1;
    if (migration.sequence !== expectedSequence || sequences.has(migration.sequence)) {
      throw new Error(`migration_registry_sequence_invalid:${migration.sequence}`);
    }
    if (!/^migration-step-\d{3}$/.test(migration.id) || ids.has(migration.id)) {
      throw new Error(`migration_registry_identity_invalid:${migration.id}`);
    }
    if (migration.filenames.length === 0) {
      throw new Error(`migration_registry_filenames_empty:${migration.id}`);
    }
    for (const dependency of migration.dependsOn) {
      if (!seenIds.has(dependency)) {
        throw new Error(`migration_registry_dependency_invalid:${migration.id}:${dependency}`);
      }
    }
    for (const filename of migration.filenames) {
      if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(filename) || filenames.has(filename)) {
        throw new Error(`migration_registry_filename_invalid:${filename}`);
      }
      filenames.add(filename);
    }
    ids.add(migration.id);
    sequences.add(migration.sequence);
    seenIds.add(migration.id);
  }
}

export const DATABASE_MIGRATION_FILENAMES = Object.freeze(
  DATABASE_MIGRATION_REGISTRY.flatMap((migration) => migration.filenames),
);

export const DATABASE_MIGRATION_PLAN_HASH = createHash("sha256")
  .update(JSON.stringify(DATABASE_MIGRATION_REGISTRY.map(({ sequence, id, filenames, dependsOn }) => ({
    sequence, id, filenames, dependsOn,
  }))))
  .digest("hex");
