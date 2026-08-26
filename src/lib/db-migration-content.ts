import { createHash } from "node:crypto";
import { BASE_DATABASE_MIGRATIONS } from "./db-migrate";
import { ACADEMY_RUNTIME_SCHEMA_REPAIR_SQL } from "./db-migrate-compat";
import {
  ACADEMY_LEARNING_MEMORY_SQL,
  ACADEMY_LESSON_PROGRESS_SQL,
  ACADEMY_PROGRESS_AUTHORITY_SQL,
  ACADEMY_REFLECTION_MEMORY_SQL,
  AUTHORITATIVE_ACADEMY_STATE_SQL,
  TRADING_ARENA_ACCOUNT_SQL,
  TRADING_ARENA_EXECUTION_SQL,
  TRADING_ARENA_REFLECTIONS_SQL,
  USER_STATE_DATABASE_MIGRATIONS,
} from "./db-migrate-user-state";
import { ADMIN_CONTROL_PLANE_SQL } from "./db-migrate-admin-control-plane";
import { ADMIN_CONTROL_PLANE_HARDENING_SQL } from "./db-migrate-admin-control-plane-hardening";
import { INTELLIGENT_NOTIFICATION_PERSISTENCE_SQL } from "./db-migrate-notifications";
import { NOTIFICATION_CREATION_OUTBOX_RUNTIME_SQL } from "./db-migrate-notification-runtime";
import { NOTIFICATION_DELIVERY_VISIBILITY_SQL } from "./db-migrate-notification-delivery-visibility";
import { OFFLINE_SYNC_COMMAND_AUTHORITY_SQL } from "./db-migrate-offline-sync";
import { NOTIFICATION_DOMAIN_OUTBOX_SQL } from "./db-migrate-notification-domain-outbox";
import {
  CRM_LEAD_AUTHORITY_SQL,
  LEGACY_ACADEMY_LEADS_LOCK_SQL,
} from "./db-migrate-crm-leads";
import { CRM_LEAD_HARDENING_SQL } from "./db-migrate-crm-leads-hardening";
import { ACADEMY_PROGRESS_AUTHORITY_V2_SQL } from "./db-migrate-academy-progress-hardening";
import { EXCHANGE_ORDER_ADMISSION_SQL } from "./db-migrate-exchange-order-admission";
import { WITHDRAWAL_ADMISSION_AUTHORITY_SQL } from "./db-migrate-withdrawal-admission";
import { WITHDRAWAL_SETTLEMENT_AUTHORITY_SQL } from "./db-migrate-withdrawal-settlement";
import { API_COMMAND_IDEMPOTENCY_SQL } from "./db-migrate-api-command-idempotency";
import { SENSITIVE_MUTATION_AUDIT_SQL } from "./db-migrate-sensitive-mutation-audit";
import { EXCHANGE_ORDER_EVIDENCE_SQL } from "./db-migrate-exchange-order-evidence";
import { EXCHANGE_ORDER_FINAL_EVIDENCE_GATE_SQL } from "./db-migrate-exchange-order-final-evidence-gate";
import { WITHDRAWAL_PREBROADCAST_EVIDENCE_SQL } from "./db-migrate-withdrawal-prebroadcast-evidence";
import { WITHDRAWAL_ADMIN_EVIDENCE_HARDENING_SQL } from "./db-migrate-withdrawal-admin-evidence-hardening";
import { WITHDRAWAL_PREBROADCAST_TRANSITION_GATE_SQL } from "./db-migrate-withdrawal-prebroadcast-transition-gate";
import { WITHDRAWAL_EXTERNAL_EFFECT_EVIDENCE_SQL } from "./db-migrate-withdrawal-external-effect-evidence";
import { WITHDRAWAL_EXTERNAL_EFFECT_GATE_SQL } from "./db-migrate-withdrawal-external-effect-gate";
import { WITHDRAWAL_EXTERNAL_EFFECT_GATE_AMOUNT_CAST_SQL } from "./db-migrate-withdrawal-external-effect-gate-amount-cast";
import { WITHDRAWAL_TENANT_BINDING_SQL } from "./db-migrate-withdrawal-tenant-binding";
import { RISK_ENFORCEMENT_AUTHORITY_SQL } from "./db-migrate-risk-enforcement-authority";
import { TENANT_PRINCIPAL_ISOLATION_SQL } from "./db-migrate-tenant-principal-isolation";
import { COMMUNITY_PROFILE_CONSENT_SQL } from "./db-migrate-community-profile-consent";
import { COMMUNITY_JOURNAL_CHALLENGE_SQL } from "./db-migrate-community-journal-challenge";
import { COMMUNITY_JOURNAL_CHALLENGE_FINALIZATION_SQL } from "./db-migrate-community-journal-challenge-finalization";
import { OPERATIONAL_JOB_EVIDENCE_SQL } from "./db-migrate-operational-job-evidence";
import {
  COMMUNITY_REPUTATION_BACKFILL_VERSION,
  COMMUNITY_REPUTATION_EVIDENCE_SQL,
} from "./db-migrate-community-reputation-evidence";
import { COMMUNITY_REPUTATION_SCORING_CONSENT_SQL } from "./db-migrate-community-reputation-scoring-consent";
import { SESSION_AUTHORITY_SQL } from "./db-migrate-session-authority";
import { SESSION_LEGACY_UNBOUND_FALLBACK_SQL } from "./db-migrate-session-legacy-fallback";
import { AI_MENTOR_TRUST_SQL } from "./db-migrate-ai-mentor-trust";
import { PLATFORM_MEMBERSHIP_WORKSPACE_BINDING_SQL } from "./db-migrate-platform-membership-workspace-binding";
import { TENANT_CUSTOM_DOMAINS_SQL } from "./db-migrate-tenant-custom-domains";
import { LEARNING_BRAIN_REFRESH_COLUMNS_SQL } from "./db-migrate-learning-brain-refresh-columns";
import { ACHIEVEMENT_CONTRACT_COLUMNS_SQL } from "./db-migrate-achievement-contract";
import { LEARNING_BRAIN_TENANT_CACHE_SQL } from "./db-migrate-learning-brain-tenant-cache";
import { NEWS_MATERIALIZATION_AUTHORITY_SQL } from "./db-migrate-news-materialization";
import { COMMUNITY_PROFILE_TENANT_PRIMARY_KEY_SQL } from "./db-migrate-community-profile-tenant-primary-key";
import { AI_MENTOR_EVIDENCE_TENANT_KEY_SQL } from "./db-migrate-ai-mentor-evidence-tenant-key";
import { ACADEMY_QUESTION_BANK_LOCALE_SQL } from "./db-migrate-academy-question-bank-locale";
import { NOTIFICATION_BRAIN_SNAPSHOT_CONTRACT_SQL } from "./db-migrate-notification-brain-snapshot-contract";
import { NOTIFICATION_BRAIN_SNAPSHOT_CONTRACT_REPAIR_SQL } from "./db-migrate-notification-brain-snapshot-contract-repair";
import { ACADEMY_MASTERY_SEASONS_SQL } from "./db-migrate-academy-mastery-seasons";
import { ACADEMY_TERM_PROGRESS_TENANT_SQL } from "./db-migrate-academy-term-progress-tenant";
import { ACADEMY_CERTIFICATE_CONTRACT_SQL } from "./db-migrate-academy-certificate-contract";
import { ACADEMY_LEARNING_COMMAND_TENANT_SQL } from "./db-migrate-academy-learning-command-tenant";
import { ADMIN_TENANT_BINDING_SQL } from "./db-migrate-admin-tenant-binding";
import { ACADEMY_CERTIFICATE_TENANT_SQL } from "./db-migrate-academy-certificate-tenant";
import { NOTIFICATION_CENTER_TENANT_SQL } from "./db-migrate-notification-center-tenant";
import { WITHDRAWAL_EVIDENCE_TENANT_SQL } from "./db-migrate-withdrawal-evidence-tenant";
import { STUDENT_TENANT_BINDING_INTEGRITY_SQL } from "./db-migrate-student-tenant-binding-integrity";
import { STUDENT_TENANT_BINDING_TRIGGER_SQL } from "./db-migrate-student-tenant-binding-trigger";
import { ADMIN_AUTH_PROVIDER_EVIDENCE_SQL } from "./db-migrate-admin-auth-provider-evidence";
import { ACADEMY_CREDENTIAL_LEDGER_SQL } from "./db-migrate-academy-credential-ledger";
import { ACADEMY_CREDENTIAL_NOTIFICATION_SQL } from "./db-migrate-academy-credential-notification";
import { ACADEMY_CREDENTIAL_LIFECYCLE_NOTIFICATION_SQL } from "./db-migrate-academy-credential-lifecycle-notification";
import { ARENA_LEAGUE_SCORE_LEDGER_SQL } from "./db-migrate-arena-league-score-ledger";
import { ARENA_LEAGUE_RANKINGS_SQL } from "./db-migrate-arena-league-rankings";
import { ARENA_LEAGUE_RANKING_REFRESH_SQL } from "./db-migrate-arena-league-ranking-refresh";
import { ARENA_ENTITLEMENT_GRANTS_SQL } from "./db-migrate-arena-entitlement-grants";
import { ACADEMY_DAILY_REPAIR_CHALLENGES_SQL } from "./db-migrate-academy-daily-repair-challenges";
import { CERTIFICATE_SHARE_EVENTS_TENANT_SQL } from "./db-migrate-certificate-share-events-tenant";
import { ACTIVE_PRINCIPAL_BINDING_ENFORCEMENT_SQL } from "./db-migrate-active-principal-binding-enforcement";
import { NOTIFICATION_SUPPRESS_DECISION_SQL } from "./db-migrate-notification-suppress-decision";
import { PHONE_IDENTITY_OTP_SQL } from "./db-migrate-phone-identity-otp";
import { COMMUNICATION_PROVIDER_CONFIG_SQL } from "./db-migrate-communication-provider-config";
import { ADMIN_PASSWORD_TOTP_SQL } from "./db-migrate-admin-password-totp";
import { PHONE_OTP_LOCAL_VERIFIER_SQL } from "./db-migrate-phone-otp-local-verifier";

export type CanonicalMigrationContent = Readonly<{
  identity: string;
  content: string;
  checksum: string;
  acceptsHistoricalChecksumPrefix: boolean;
  compatibleHistoricalChecksums: readonly string[];
}>;

export function normalizeMigrationContent(content: string): string {
  return content.replace(/\r\n?/g, "\n").trim();
}

export function canonicalMigrationChecksum(content: string): string {
  return createHash("sha256").update(normalizeMigrationContent(content)).digest("hex");
}

export function historicalMigrationChecksum(content: string): string {
  return createHash("sha256")
    .update(content.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

const canonical = (
  identity: string,
  content: string,
  compatibleHistoricalChecksums: readonly string[] = [],
  historicalChecksum = historicalMigrationChecksum(content),
): CanonicalMigrationContent => ({
  identity,
  content,
  checksum: canonicalMigrationChecksum(content),
  acceptsHistoricalChecksumPrefix: false,
  compatibleHistoricalChecksums: Object.freeze([
    historicalChecksum,
    ...compatibleHistoricalChecksums,
  ]),
});

const one = (
  identity: string,
  content: string,
  compatibleHistoricalChecksums: readonly string[] = [],
  historicalChecksum?: string,
): readonly CanonicalMigrationContent[] =>
  Object.freeze([
    canonical(identity, content, compatibleHistoricalChecksums, historicalChecksum),
  ]);

const EXPECTED_BASE_IDENTITIES = [
  "0001_initial_schema.sql",
  "0002_extended_schema.sql",
  "0003_tenant_membership.sql",
  "0004_trading_core.sql",
  "0005_wallet_balances.sql",
  "0006_spot_trading_indexes.sql",
  "0007_security.sql",
  "0009_identity_security.sql",
  "0010_withdrawals.sql",
  "0011_withdrawal_execution.sql",
  "0008_auth_hardening.sql",
  "0002_withdrawal_ledger_idempotency.sql",
] as const;

function baseContent(): readonly CanonicalMigrationContent[] {
  if (
    BASE_DATABASE_MIGRATIONS.length !== EXPECTED_BASE_IDENTITIES.length ||
    BASE_DATABASE_MIGRATIONS.some(({ filename }, index) => filename !== EXPECTED_BASE_IDENTITIES[index])
  ) {
    throw new Error("canonical_base_migration_identity_drift");
  }
  return Object.freeze(BASE_DATABASE_MIGRATIONS.map(
    ({ filename, sql }) => canonical(filename, sql),
  ));
}

const userStateSql = new Map(USER_STATE_DATABASE_MIGRATIONS.map(({ filename, sql }) => [filename, sql]));
const requiredUserState = (identity: string, fallback: string): string => userStateSql.get(identity) ?? fallback;
const communityReputationContent =
  `${normalizeMigrationContent(COMMUNITY_REPUTATION_EVIDENCE_SQL)}\n${COMMUNITY_REPUTATION_BACKFILL_VERSION}`;
const communityReputationHistoricalChecksum = createHash("sha256")
  .update(
    `${COMMUNITY_REPUTATION_EVIDENCE_SQL.replace(/\s+/g, " ").trim()}\n` +
    COMMUNITY_REPUTATION_BACKFILL_VERSION,
  )
  .digest("hex")
  .slice(0, 16);

export const CANONICAL_MIGRATION_CONTENT = Object.freeze({
  base: baseContent(),
  compatibility: one("0012_academy_runtime_schema_repair.sql", ACADEMY_RUNTIME_SCHEMA_REPAIR_SQL),
  userState: Object.freeze([
    canonical("0013_authoritative_academy_state.sql", requiredUserState("0013_authoritative_academy_state.sql", AUTHORITATIVE_ACADEMY_STATE_SQL)),
    canonical("0014_academy_learning_memory.sql", requiredUserState("0014_academy_learning_memory.sql", ACADEMY_LEARNING_MEMORY_SQL)),
    canonical("0015_academy_reflection_memory.sql", requiredUserState("0015_academy_reflection_memory.sql", ACADEMY_REFLECTION_MEMORY_SQL)),
    canonical("0016_trading_arena_account.sql", requiredUserState("0016_trading_arena_account.sql", TRADING_ARENA_ACCOUNT_SQL)),
    canonical("0017_academy_lesson_progress.sql", requiredUserState("0017_academy_lesson_progress.sql", ACADEMY_LESSON_PROGRESS_SQL)),
    canonical("0020_trading_arena_execution.sql", requiredUserState("0020_trading_arena_execution.sql", TRADING_ARENA_EXECUTION_SQL)),
    canonical("0021_academy_progress_authority.sql", requiredUserState("0021_academy_progress_authority.sql", ACADEMY_PROGRESS_AUTHORITY_SQL)),
    canonical("0022_trading_arena_reflections.sql", requiredUserState("0022_trading_arena_reflections.sql", TRADING_ARENA_REFLECTIONS_SQL)),
  ]),
  adminFoundation: one("0018_admin_control_plane_foundation.sql", ADMIN_CONTROL_PLANE_SQL),
  adminHardening: one("0019_admin_control_plane_hardening.sql", ADMIN_CONTROL_PLANE_HARDENING_SQL),
  notifications: one("0020_intelligent_notification_persistence.sql", INTELLIGENT_NOTIFICATION_PERSISTENCE_SQL),
  notificationRuntime: one("0021_notification_creation_outbox_runtime.sql", NOTIFICATION_CREATION_OUTBOX_RUNTIME_SQL),
  notificationVisibility: one("0022_notification_delivery_visibility.sql", NOTIFICATION_DELIVERY_VISIBILITY_SQL),
  offlineSync: one("0023_offline_sync_command_authority.sql", OFFLINE_SYNC_COMMAND_AUTHORITY_SQL),
  notificationOutbox: one("0024_notification_domain_outbox.sql", NOTIFICATION_DOMAIN_OUTBOX_SQL),
  crmLeads: one(
    "0025_crm_lead_authority.sql",
    `${CRM_LEAD_AUTHORITY_SQL}\n${LEGACY_ACADEMY_LEADS_LOCK_SQL}`,
  ),
  crmHardening: one("0026_crm_lead_hardening.sql", CRM_LEAD_HARDENING_SQL),
  academyHardening: one("0027_academy_progress_authority_v2.sql", ACADEMY_PROGRESS_AUTHORITY_V2_SQL),
  exchangeAdmission: one("0027_exchange_order_admission_authority.sql", EXCHANGE_ORDER_ADMISSION_SQL),
  withdrawalAdmission: one("0030_withdrawal_admission_authority.sql", WITHDRAWAL_ADMISSION_AUTHORITY_SQL),
  withdrawalSettlement: one("0031_withdrawal_settlement_authority.sql", WITHDRAWAL_SETTLEMENT_AUTHORITY_SQL),
  commandIdempotency: one("0032_api_command_idempotency.sql", API_COMMAND_IDEMPOTENCY_SQL),
  sensitiveAudit: one("0033_sensitive_mutation_audit.sql", SENSITIVE_MUTATION_AUDIT_SQL),
  exchangeEvidence: one("0037_exchange_order_transactional_evidence.sql", EXCHANGE_ORDER_EVIDENCE_SQL),
  exchangeEvidenceGate: one("0038_exchange_order_final_evidence_gate.sql", EXCHANGE_ORDER_FINAL_EVIDENCE_GATE_SQL),
  withdrawalPrebroadcast: one("0039_withdrawal_prebroadcast_evidence.sql", WITHDRAWAL_PREBROADCAST_EVIDENCE_SQL),
  withdrawalAdminHardening: one("0040_withdrawal_admin_evidence_hardening.sql", WITHDRAWAL_ADMIN_EVIDENCE_HARDENING_SQL),
  withdrawalTransition: one("0041_withdrawal_prebroadcast_transition_gate.sql", WITHDRAWAL_PREBROADCAST_TRANSITION_GATE_SQL),
  withdrawalEvidence: one("0042_withdrawal_external_effect_evidence.sql", WITHDRAWAL_EXTERNAL_EFFECT_EVIDENCE_SQL),
  withdrawalGate: one("0043_withdrawal_external_effect_gate.sql", WITHDRAWAL_EXTERNAL_EFFECT_GATE_SQL),
  withdrawalAmountCast: one("0044_withdrawal_external_effect_gate_amount_cast.sql", WITHDRAWAL_EXTERNAL_EFFECT_GATE_AMOUNT_CAST_SQL),
  risk: one("0045_risk_enforcement_authority.sql", RISK_ENFORCEMENT_AUTHORITY_SQL),
  tenant: one(
    "0046_tenant_principal_isolation_foundation.sql",
    TENANT_PRINCIPAL_ISOLATION_SQL,
    ["0fb4eb3a3bd8deede63dc53edb211ef6bc12d7c329f48e93a918070cbd0167be"],
  ),
  communityConsent: one("0047_community_profile_consent_authority.sql", COMMUNITY_PROFILE_CONSENT_SQL),
  communityChallenge: one("0048_community_journal_reflection_challenge.sql", COMMUNITY_JOURNAL_CHALLENGE_SQL),
  communityFinalization: one("0049_community_journal_challenge_finalization.sql", COMMUNITY_JOURNAL_CHALLENGE_FINALIZATION_SQL),
  operationalEvidence: one("0050_operational_job_evidence.sql", OPERATIONAL_JOB_EVIDENCE_SQL),
  reputationEvidence: one(
    "0051_community_reputation_evidence.sql",
    communityReputationContent,
    [],
    communityReputationHistoricalChecksum,
  ),
  reputationConsent: one("0052_community_reputation_scoring_consent.sql", COMMUNITY_REPUTATION_SCORING_CONSENT_SQL),
  sessionAuthority: one("0035_session_authority.sql", SESSION_AUTHORITY_SQL),
  sessionFallback: one("0036_session_legacy_unbound_fallback.sql", SESSION_LEGACY_UNBOUND_FALLBACK_SQL),
  aiMentor: one("0034_ai_mentor_trust_boundary.sql", AI_MENTOR_TRUST_SQL),
  membershipWorkspaceBinding: one(
    "0053_platform_membership_workspace_binding.sql",
    PLATFORM_MEMBERSHIP_WORKSPACE_BINDING_SQL,
  ),
  tenantDomains: one("0054_tenant_custom_domains.sql", TENANT_CUSTOM_DOMAINS_SQL),
  learningBrainRefreshColumns: one(
    "0055_learning_brain_refresh_columns.sql",
    LEARNING_BRAIN_REFRESH_COLUMNS_SQL,
  ),
  achievementContract: one(
    "0056_achievement_contract_columns.sql",
    ACHIEVEMENT_CONTRACT_COLUMNS_SQL,
  ),
  learningBrainTenantCache: one(
    "0057_learning_brain_tenant_cache.sql",
    LEARNING_BRAIN_TENANT_CACHE_SQL,
  ),
  newsMaterialization: one(
    "0058_news_materialization_authority.sql",
    NEWS_MATERIALIZATION_AUTHORITY_SQL,
  ),
  communityProfileTenantPrimaryKey: one(
    "0059_community_profile_tenant_primary_key.sql",
    COMMUNITY_PROFILE_TENANT_PRIMARY_KEY_SQL,
  ),
  aiMentorEvidenceTenantKey: one(
    "0060_ai_mentor_evidence_tenant_key.sql",
    AI_MENTOR_EVIDENCE_TENANT_KEY_SQL,
  ),
  withdrawalTenantBinding: one(
    "0061_withdrawal_tenant_binding.sql",
    WITHDRAWAL_TENANT_BINDING_SQL,
  ),
  academyQuestionBankLocale: one(
    "0062_academy_question_bank_locale.sql",
    ACADEMY_QUESTION_BANK_LOCALE_SQL,
  ),
  notificationBrainSnapshotContract: one(
    "0063_notification_brain_snapshot_contract.sql",
    NOTIFICATION_BRAIN_SNAPSHOT_CONTRACT_SQL,
  ),
  notificationBrainSnapshotContractRepair: one(
    "0064_notification_brain_snapshot_contract_repair.sql",
    NOTIFICATION_BRAIN_SNAPSHOT_CONTRACT_REPAIR_SQL,
  ),
  academyMasterySeasons: one(
    "0065_academy_mastery_seasons.sql",
    ACADEMY_MASTERY_SEASONS_SQL,
  ),
  academyTermProgressTenant: one(
    "0066_academy_term_progress_tenant.sql",
    ACADEMY_TERM_PROGRESS_TENANT_SQL,
  ),
  academyCertificateContract: one(
    "0067_academy_certificate_contract.sql",
    ACADEMY_CERTIFICATE_CONTRACT_SQL,
  ),
  academyLearningCommandTenant: one(
    "0068_academy_learning_command_tenant.sql",
    ACADEMY_LEARNING_COMMAND_TENANT_SQL,
  ),
  adminTenantBinding: one(
    "0069_admin_tenant_binding.sql",
    ADMIN_TENANT_BINDING_SQL,
  ),
  academyCertificateTenant: one(
    "0070_academy_certificate_tenant.sql",
    ACADEMY_CERTIFICATE_TENANT_SQL,
  ),
  notificationCenterTenant: one(
    "0071_notification_center_tenant.sql",
    NOTIFICATION_CENTER_TENANT_SQL,
  ),
  withdrawalEvidenceTenant: one(
    "0072_withdrawal_evidence_tenant.sql",
    WITHDRAWAL_EVIDENCE_TENANT_SQL,
  ),
  studentTenantBindingIntegrity: one(
    "0073_student_tenant_binding_integrity.sql",
    STUDENT_TENANT_BINDING_INTEGRITY_SQL,
  ),
  studentTenantBindingTrigger: one(
    "0074_student_tenant_binding_trigger.sql",
    STUDENT_TENANT_BINDING_TRIGGER_SQL,
  ),
  adminAuthProviderEvidence: one(
    "0075_admin_auth_provider_evidence.sql",
    ADMIN_AUTH_PROVIDER_EVIDENCE_SQL,
  ),
  academyCredentialLedger: one(
    "0076_academy_credential_ledger.sql",
    ACADEMY_CREDENTIAL_LEDGER_SQL,
  ),
  academyCredentialNotification: one(
    "0077_academy_credential_notification.sql",
    ACADEMY_CREDENTIAL_NOTIFICATION_SQL,
  ),
  arenaLeagueScoreLedger: one(
    "0078_arena_league_score_ledger.sql",
    ARENA_LEAGUE_SCORE_LEDGER_SQL,
  ),
  arenaLeagueRankings: one(
    "0079_arena_league_rankings.sql",
    ARENA_LEAGUE_RANKINGS_SQL,
  ),
  arenaLeagueRankingRefresh: one(
    "0080_arena_league_ranking_refresh.sql",
    ARENA_LEAGUE_RANKING_REFRESH_SQL,
  ),
  academyCredentialLifecycleNotification: one(
    "0081_academy_credential_lifecycle_notification.sql",
    ACADEMY_CREDENTIAL_LIFECYCLE_NOTIFICATION_SQL,
  ),
  arenaEntitlementGrants: one(
    "0082_arena_entitlement_grants.sql",
    ARENA_ENTITLEMENT_GRANTS_SQL,
  ),
  academyDailyRepairChallenges: one(
    "0083_academy_daily_repair_challenges.sql",
    ACADEMY_DAILY_REPAIR_CHALLENGES_SQL,
  ),
  certificateShareEventsTenant: one(
    "0084_certificate_share_events_tenant.sql",
    CERTIFICATE_SHARE_EVENTS_TENANT_SQL,
  ),
  activePrincipalBindingEnforcement: one(
    "0085_active_principal_binding_enforcement.sql",
    ACTIVE_PRINCIPAL_BINDING_ENFORCEMENT_SQL,
  ),
  notificationSuppressDecision: one(
    "0086_notification_suppress_decision.sql",
    NOTIFICATION_SUPPRESS_DECISION_SQL,
  ),
  phoneIdentityOtp: one(
    "0087_phone_identity_otp.sql",
    PHONE_IDENTITY_OTP_SQL,
  ),
  communicationProviderConfig: one(
    "0088_communication_provider_config.sql",
    COMMUNICATION_PROVIDER_CONFIG_SQL,
  ),
  adminPasswordTotp: one(
    "0089_admin_password_totp.sql",
    ADMIN_PASSWORD_TOTP_SQL,
  ),
  phoneOtpLocalVerifier: one(
    "0090_phone_otp_local_verifier.sql",
    PHONE_OTP_LOCAL_VERIFIER_SQL,
  ),
});
