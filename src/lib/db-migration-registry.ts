import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  CANONICAL_MIGRATION_CONTENT,
  canonicalMigrationChecksum,
  type CanonicalMigrationContent,
} from "./db-migration-content";
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
import { runPlatformMembershipWorkspaceBindingMigrations } from "./db-migrate-platform-membership-workspace-binding";
import { runTenantCustomDomainsMigrations } from "./db-migrate-tenant-custom-domains";
import { runLearningBrainRefreshColumnsMigrations } from "./db-migrate-learning-brain-refresh-columns";

export type MigrationRegistryEntry = Readonly<{
  sequence: number;
  id: string;
  owner: string;
  domain: string;
  checksum: string;
  migrations: readonly CanonicalMigrationContent[];
  filenames: readonly string[];
  dependsOn: readonly string[];
  run: (client: PoolClient) => Promise<void>;
}>;

const entry = (
  sequence: number,
  id: string,
  migrations: readonly CanonicalMigrationContent[],
  owner: string,
  domain: string,
  run: MigrationRegistryEntry["run"],
): MigrationRegistryEntry => {
  const checksum = migrationEntryChecksum(migrations);
  return {
    sequence,
    id,
    owner,
    domain,
    checksum,
    migrations,
    filenames: migrations.map(({ identity }) => identity),
    dependsOn: sequence === 1 ? [] : [`migration-step-${String(sequence - 1).padStart(3, "0")}`],
    run,
  };
};

export function migrationEntryChecksum(migrations: readonly CanonicalMigrationContent[]): string {
  return createHash("sha256")
    .update(JSON.stringify(migrations.map(({ identity, checksum }) => ({ identity, checksum }))))
    .digest("hex");
}

export const DATABASE_MIGRATION_REGISTRY = [
  entry(1, "migration-step-001", CANONICAL_MIGRATION_CONTENT.base, "platform-infrastructure", "platform-core", runMigrations),
  entry(2, "migration-step-002", CANONICAL_MIGRATION_CONTENT.compatibility, "academy-platform", "academy", runCompatibilityMigrations),
  entry(3, "migration-step-003", CANONICAL_MIGRATION_CONTENT.userState, "academy-platform", "academy", runUserStateMigrations),
  entry(4, "migration-step-004", CANONICAL_MIGRATION_CONTENT.adminFoundation, "security-platform", "admin", runAdminControlPlaneMigrations),
  entry(5, "migration-step-005", CANONICAL_MIGRATION_CONTENT.adminHardening, "security-platform", "admin", runAdminControlPlaneHardeningMigrations),
  entry(6, "migration-step-006", CANONICAL_MIGRATION_CONTENT.notifications, "engagement-platform", "notifications", runNotificationMigrations),
  entry(7, "migration-step-007", CANONICAL_MIGRATION_CONTENT.notificationRuntime, "engagement-platform", "notifications", runNotificationRuntimeMigrations),
  entry(8, "migration-step-008", CANONICAL_MIGRATION_CONTENT.notificationVisibility, "engagement-platform", "notifications", runNotificationDeliveryVisibilityMigrations),
  entry(9, "migration-step-009", CANONICAL_MIGRATION_CONTENT.offlineSync, "platform-infrastructure", "offline-sync", runOfflineSyncMigrations),
  entry(10, "migration-step-010", CANONICAL_MIGRATION_CONTENT.notificationOutbox, "engagement-platform", "notifications", runNotificationDomainOutboxMigrations),
  entry(11, "migration-step-011", CANONICAL_MIGRATION_CONTENT.crmLeads, "growth-platform", "crm", runCrmLeadMigrations),
  entry(12, "migration-step-012", CANONICAL_MIGRATION_CONTENT.crmHardening, "growth-platform", "crm", runCrmLeadHardeningMigrations),
  entry(13, "migration-step-013", CANONICAL_MIGRATION_CONTENT.academyHardening, "academy-platform", "academy", runAcademyProgressHardeningMigrations),
  entry(14, "migration-step-014", CANONICAL_MIGRATION_CONTENT.exchangeAdmission, "exchange-platform", "exchange", runExchangeOrderAdmissionMigrations),
  entry(15, "migration-step-015", CANONICAL_MIGRATION_CONTENT.withdrawalAdmission, "custody-platform", "withdrawals", runWithdrawalAdmissionMigrations),
  entry(16, "migration-step-016", CANONICAL_MIGRATION_CONTENT.withdrawalSettlement, "custody-platform", "withdrawals", runWithdrawalSettlementMigrations),
  entry(17, "migration-step-017", CANONICAL_MIGRATION_CONTENT.commandIdempotency, "platform-infrastructure", "api-idempotency", runApiCommandIdempotencyMigrations),
  entry(18, "migration-step-018", CANONICAL_MIGRATION_CONTENT.sensitiveAudit, "security-platform", "audit", runSensitiveMutationAuditMigrations),
  entry(19, "migration-step-019", CANONICAL_MIGRATION_CONTENT.exchangeEvidence, "exchange-platform", "exchange", runExchangeOrderEvidenceMigrations),
  entry(20, "migration-step-020", CANONICAL_MIGRATION_CONTENT.exchangeEvidenceGate, "exchange-platform", "exchange", runExchangeOrderFinalEvidenceGateMigrations),
  entry(21, "migration-step-021", CANONICAL_MIGRATION_CONTENT.withdrawalPrebroadcast, "custody-platform", "withdrawals", runWithdrawalPrebroadcastEvidenceMigrations),
  entry(22, "migration-step-022", CANONICAL_MIGRATION_CONTENT.withdrawalAdminHardening, "custody-platform", "withdrawals", runWithdrawalAdminEvidenceHardeningMigrations),
  entry(23, "migration-step-023", CANONICAL_MIGRATION_CONTENT.withdrawalTransition, "custody-platform", "withdrawals", runWithdrawalPrebroadcastTransitionGateMigrations),
  entry(24, "migration-step-024", CANONICAL_MIGRATION_CONTENT.withdrawalEvidence, "custody-platform", "withdrawals", runWithdrawalExternalEffectEvidenceMigrations),
  entry(25, "migration-step-025", CANONICAL_MIGRATION_CONTENT.withdrawalGate, "custody-platform", "withdrawals", runWithdrawalExternalEffectGateMigrations),
  entry(26, "migration-step-026", CANONICAL_MIGRATION_CONTENT.withdrawalAmountCast, "custody-platform", "withdrawals", runWithdrawalExternalEffectGateAmountCastMigrations),
  entry(27, "migration-step-027", CANONICAL_MIGRATION_CONTENT.risk, "risk-platform", "risk", runRiskEnforcementAuthorityMigrations),
  entry(28, "migration-step-028", CANONICAL_MIGRATION_CONTENT.tenant, "security-platform", "tenancy", runTenantPrincipalIsolationMigrations),
  entry(29, "migration-step-029", CANONICAL_MIGRATION_CONTENT.communityConsent, "academy-platform", "community", runCommunityProfileConsentMigrations),
  entry(30, "migration-step-030", CANONICAL_MIGRATION_CONTENT.communityChallenge, "academy-platform", "community", runCommunityJournalChallengeMigrations),
  entry(31, "migration-step-031", CANONICAL_MIGRATION_CONTENT.communityFinalization, "academy-platform", "community", runCommunityJournalChallengeFinalizationMigrations),
  entry(32, "migration-step-032", CANONICAL_MIGRATION_CONTENT.operationalEvidence, "platform-infrastructure", "operations", runOperationalJobEvidenceMigrations),
  entry(33, "migration-step-033", CANONICAL_MIGRATION_CONTENT.reputationEvidence, "academy-platform", "community", runCommunityReputationEvidenceMigrations),
  entry(34, "migration-step-034", CANONICAL_MIGRATION_CONTENT.reputationConsent, "academy-platform", "community", runCommunityReputationScoringConsentMigrations),
  entry(35, "migration-step-035", CANONICAL_MIGRATION_CONTENT.sessionAuthority, "security-platform", "authentication", runSessionAuthorityMigrations),
  entry(36, "migration-step-036", CANONICAL_MIGRATION_CONTENT.sessionFallback, "security-platform", "authentication", runSessionLegacyFallbackMigrations),
  entry(37, "migration-step-037", CANONICAL_MIGRATION_CONTENT.aiMentor, "academy-platform", "ai-mentor", runAiMentorTrustMigrations),
  entry(38, "migration-step-038", CANONICAL_MIGRATION_CONTENT.membershipWorkspaceBinding, "security-platform", "tenancy", runPlatformMembershipWorkspaceBindingMigrations),
  entry(39, "migration-step-039", CANONICAL_MIGRATION_CONTENT.tenantDomains, "security-platform", "tenancy", runTenantCustomDomainsMigrations),
  entry(40, "migration-step-040", CANONICAL_MIGRATION_CONTENT.learningBrainRefreshColumns, "academy-platform", "ai-mentor", runLearningBrainRefreshColumnsMigrations),
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
    if (migration.id !== `migration-step-${String(migration.sequence).padStart(3, "0")}`) {
      throw new Error(`migration_registry_identity_sequence_mismatch:${migration.id}`);
    }
    if (!/^[a-z][a-z0-9-]{2,63}$/.test(migration.owner)) {
      throw new Error(`migration_registry_owner_invalid:${migration.id}`);
    }
    if (!/^[a-z][a-z0-9-]{2,63}$/.test(migration.domain)) {
      throw new Error(`migration_registry_domain_invalid:${migration.id}`);
    }
    if (!/^[0-9a-f]{64}$/.test(migration.checksum)) {
      throw new Error(`migration_registry_checksum_invalid:${migration.id}`);
    }
    if (migration.checksum !== migrationEntryChecksum(migration.migrations)) {
      throw new Error(`migration_registry_checksum_mismatch:${migration.id}`);
    }
    const requiredDependencies = migration.sequence === 1
      ? []
      : [`migration-step-${String(migration.sequence - 1).padStart(3, "0")}`];
    if (
      migration.dependsOn.length !== requiredDependencies.length ||
      migration.dependsOn.some((dependency, dependencyIndex) => dependency !== requiredDependencies[dependencyIndex])
    ) {
      throw new Error(`migration_registry_dependency_chain_invalid:${migration.id}`);
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
    if (
      migration.migrations.length !== migration.filenames.length ||
      migration.migrations.some(({ identity, checksum }, migrationIndex) =>
        identity !== migration.filenames[migrationIndex] ||
        !/^[0-9a-f]{64}$/.test(checksum) ||
        typeof migration.migrations[migrationIndex].acceptsHistoricalChecksumPrefix !== "boolean" ||
        checksum !== canonicalMigrationChecksum(migration.migrations[migrationIndex].content) ||
        migration.migrations[migrationIndex].compatibleHistoricalChecksums.some(
          (historicalChecksum) =>
            !/^[0-9a-f]{16}(?:[0-9a-f]{48})?$/.test(historicalChecksum) ||
            historicalChecksum === checksum,
        ))
    ) {
      throw new Error(`migration_registry_content_invalid:${migration.id}`);
    }
    ids.add(migration.id);
    sequences.add(migration.sequence);
    seenIds.add(migration.id);
  }
}

export const DATABASE_MIGRATION_FILENAMES = Object.freeze(
  DATABASE_MIGRATION_REGISTRY.flatMap((migration) => migration.filenames),
);

export const DATABASE_MIGRATION_EXPECTATIONS = Object.freeze(
  DATABASE_MIGRATION_REGISTRY.flatMap((migration) =>
    migration.migrations.map(({
      identity,
      checksum,
      acceptsHistoricalChecksumPrefix,
      compatibleHistoricalChecksums,
    }, ordinal) => Object.freeze({
      sequence: migration.sequence,
      ordinal: ordinal + 1,
      migrationId: migration.id,
      identity,
      checksum,
      acceptsHistoricalChecksumPrefix,
      compatibleHistoricalChecksums,
      owner: migration.owner,
      domain: migration.domain,
    }))),
);

export function computeMigrationPlanHash(registry: readonly MigrationRegistryEntry[]): string {
  return createHash("sha256")
    .update(JSON.stringify(registry.map(({
    sequence, id, migrations, dependsOn, owner, domain, checksum,
  }) => ({
    sequence,
    id,
    dependsOn,
    migrations: migrations.map(({
      identity,
      checksum: contentChecksum,
      acceptsHistoricalChecksumPrefix,
      compatibleHistoricalChecksums,
    }) => ({
      identity,
      checksum: contentChecksum,
      acceptsHistoricalChecksumPrefix,
      compatibleHistoricalChecksums,
    })),
    owner,
    domain,
    checksum,
  }))))
    .digest("hex");
}

export const DATABASE_MIGRATION_PLAN_HASH = computeMigrationPlanHash(DATABASE_MIGRATION_REGISTRY);
