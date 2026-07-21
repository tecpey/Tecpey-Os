import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withDb, withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { AvailableTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveMutationAuditEvent,
} from "@/lib/security/sensitive-mutation-audit";

export const COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION =
  "community-reputation-scoring-consent-v1";
export const COMMUNITY_REPUTATION_SCORING_CONSENT_POLICY =
  "community-reputation-scoring-consent-authority-v1";

export type CommunityReputationScoringConsent = {
  enabled: boolean;
  revision: number;
  consentVersion: string;
  consentedAt: string | null;
  updatedAt: string;
};

export type CommunityReputationScoringConsentLoadResult =
  | { available: true; consent: CommunityReputationScoringConsent | null }
  | { available: false; consent: null };

export type CommunityReputationScoringConsentAuditContext = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "actorType" | "actorId" | "correlationId" | "requestHash"
>;

export type CommunityReputationScoringConsentUpdateResult =
  | {
      ok: true;
      changed: boolean;
      replayed: boolean;
      consent: CommunityReputationScoringConsent;
    }
  | {
      ok: false;
      reason:
        | "unavailable"
        | "not_found"
        | "revision_conflict"
        | "idempotency_conflict";
    };

type ScoringConsentRow = {
  public_profile_id: string;
  tenant_id: string;
  workspace_id: string;
  principal_type: "student";
  principal_id: string;
  student_id: string;
  enabled: boolean;
  revision: string | number;
  consent_version: string;
  consented_at: Date | string | null;
  updated_at: Date | string;
};

type ExistingConsentAudit = {
  actor_type: string;
  actor_id: string;
  resource_type: string;
  resource_id: string;
  outcome: string;
  request_hash: string;
  metadata: Record<string, unknown> | null;
};

function toNumber(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function mapConsent(row: ScoringConsentRow): CommunityReputationScoringConsent {
  return {
    enabled: row.enabled,
    revision: toNumber(row.revision),
    consentVersion: row.consent_version,
    consentedAt: iso(row.consented_at),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function assertProfileContext(
  context: AvailableTenantPrincipalContext,
  requiredScope: "community:profile:read" | "community:profile:write",
): void {
  if (
    context.principalType !== "student" ||
    !context.principalId ||
    !context.scopes.includes(requiredScope)
  ) {
    throw new Error("community_reputation_scoring_consent_context_invalid");
  }
}

function assertPrincipalContext(context: AvailableTenantPrincipalContext): void {
  if (context.principalType !== "student" || !context.principalId) {
    throw new Error("community_reputation_scoring_consent_principal_invalid");
  }
}

function assertAudit(
  context: AvailableTenantPrincipalContext,
  audit: CommunityReputationScoringConsentAuditContext,
): void {
  if (
    audit.tenantId !== context.tenantId ||
    audit.actorType !== "student" ||
    audit.actorId !== context.principalId
  ) {
    throw new Error("community_reputation_scoring_consent_audit_context_mismatch");
  }
}

export function fingerprintCommunityReputationScoringPrincipal(input: {
  tenantId: string;
  principalId: string;
}): string {
  return createHash("sha256")
    .update("tecpey-community-reputation-scoring-principal-v1\0")
    .update(input.tenantId)
    .update("\0")
    .update(input.principalId)
    .digest("hex");
}

const CONSENT_SELECT = `
  SELECT consent.public_profile_id::text,
         consent.tenant_id,
         consent.workspace_id,
         consent.principal_type,
         consent.principal_id,
         consent.student_id::text,
         consent.enabled,
         consent.revision,
         consent.consent_version,
         consent.consented_at,
         consent.updated_at
    FROM academy_community_reputation_scoring_consents consent
    JOIN platform_principal_bindings binding
      ON binding.tenant_id = consent.tenant_id
     AND binding.workspace_id = consent.workspace_id
     AND binding.principal_type = consent.principal_type
     AND binding.principal_id = consent.principal_id
     AND binding.status = 'active'`;

async function loadConsentTx(
  client: PoolClient,
  context: AvailableTenantPrincipalContext,
  lock = false,
): Promise<ScoringConsentRow | null> {
  const selected = await client.query<ScoringConsentRow>(
    `${CONSENT_SELECT}
      WHERE consent.tenant_id = $1
        AND consent.workspace_id = $2
        AND consent.principal_type = 'student'
        AND consent.principal_id = $3
      LIMIT 1${lock ? " FOR UPDATE OF consent" : ""}`,
    [context.tenantId, context.workspaceId, context.principalId],
  );
  return selected.rows[0] ?? null;
}

export async function isCommunityReputationScoringConsentEnabledTx(
  client: PoolClient,
  context: AvailableTenantPrincipalContext,
): Promise<boolean> {
  assertPrincipalContext(context);
  const row = await loadConsentTx(client, context, false);
  return Boolean(
    row &&
      row.enabled === true &&
      row.consent_version === COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION &&
      row.consented_at !== null,
  );
}

export async function loadCommunityReputationScoringConsent(
  context: AvailableTenantPrincipalContext,
): Promise<CommunityReputationScoringConsentLoadResult> {
  assertProfileContext(context, "community:profile:read");
  const principalFingerprint = fingerprintCommunityReputationScoringPrincipal({
    tenantId: context.tenantId,
    principalId: context.principalId,
  });
  try {
    const result = await withDb((client) => loadConsentTx(client, context));
    if (!result.enabled) return { available: false, consent: null };
    return {
      available: true,
      consent: result.value ? mapConsent(result.value) : null,
    };
  } catch (error) {
    logger.error("[community-reputation-scoring-consent] load failed", {
      principalFingerprint,
      error: String(error),
    });
    return { available: false, consent: null };
  }
}

function exactReplayMatches(
  audit: ExistingConsentAudit,
  row: ScoringConsentRow,
  input: {
    expectedRevision: number;
    enabled: boolean;
    requestHash: string;
    actorType: string;
    actorId: string;
  },
): boolean {
  const metadata = audit.metadata ?? {};
  return (
    audit.actor_type === input.actorType &&
    audit.actor_id === input.actorId &&
    audit.resource_type === "community_profile" &&
    audit.resource_id === row.public_profile_id &&
    audit.outcome === "success" &&
    audit.request_hash === input.requestHash &&
    metadata.authority === COMMUNITY_REPUTATION_SCORING_CONSENT_POLICY &&
    metadata.consentVersion === COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION &&
    metadata.expectedRevision === input.expectedRevision &&
    metadata.revision === input.expectedRevision + 1 &&
    metadata.reputationScoringEnabled === input.enabled &&
    toNumber(row.revision) === input.expectedRevision + 1 &&
    row.enabled === input.enabled &&
    row.consent_version === COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION
  );
}

export async function updateCommunityReputationScoringConsent(input: {
  context: AvailableTenantPrincipalContext;
  expectedRevision: number;
  enabled: boolean;
  audit: CommunityReputationScoringConsentAuditContext;
}): Promise<CommunityReputationScoringConsentUpdateResult> {
  assertProfileContext(input.context, "community:profile:write");
  assertAudit(input.context, input.audit);
  const principalFingerprint = fingerprintCommunityReputationScoringPrincipal({
    tenantId: input.context.tenantId,
    principalId: input.context.principalId,
  });

  try {
    const result = await withTx(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `community-reputation-scoring-consent:${input.context.tenantId}:${input.context.principalId}`,
      ]);
      const row = await loadConsentTx(client, input.context, true);
      if (!row) return { kind: "not_found" as const };

      const existingAudit = await client.query<ExistingConsentAudit>(
        `SELECT actor_type,
                actor_id,
                resource_type,
                resource_id,
                outcome,
                request_hash,
                metadata
           FROM sensitive_mutation_audit_events
          WHERE tenant_id = $1
            AND action = 'community.profile.consent.update'
            AND correlation_id = $2
          LIMIT 1`,
        [input.context.tenantId, input.audit.correlationId],
      );
      if (existingAudit.rows[0]) {
        if (
          !exactReplayMatches(existingAudit.rows[0], row, {
            expectedRevision: input.expectedRevision,
            enabled: input.enabled,
            requestHash: input.audit.requestHash,
            actorType: input.audit.actorType,
            actorId: input.audit.actorId,
          })
        ) {
          return { kind: "idempotency_conflict" as const };
        }
        return {
          kind: "success" as const,
          changed: true,
          replayed: true,
          consent: mapConsent(row),
        };
      }

      const current = mapConsent(row);
      if (current.revision !== input.expectedRevision) {
        return { kind: "revision_conflict" as const };
      }
      if (
        current.enabled === input.enabled &&
        current.consentVersion === COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION
      ) {
        return {
          kind: "success" as const,
          changed: false,
          replayed: false,
          consent: current,
        };
      }

      const updated = await client.query<ScoringConsentRow>(
        `UPDATE academy_community_reputation_scoring_consents
            SET enabled = $5,
                consent_version = $6,
                consented_at = NOW(),
                revision = revision + 1,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND workspace_id = $2
            AND principal_type = 'student'
            AND principal_id = $3
            AND revision = $4
          RETURNING public_profile_id::text,
                    tenant_id,
                    workspace_id,
                    principal_type,
                    principal_id,
                    student_id::text,
                    enabled,
                    revision,
                    consent_version,
                    consented_at,
                    updated_at`,
        [
          input.context.tenantId,
          input.context.workspaceId,
          input.context.principalId,
          input.expectedRevision,
          input.enabled,
          COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION,
        ],
      );
      if (!updated.rows[0]) return { kind: "revision_conflict" as const };

      await writeSensitiveMutationAuditTx(client, {
        ...input.audit,
        action: "community.profile.consent.update",
        resourceType: "community_profile",
        resourceId: row.public_profile_id,
        outcome: "success",
        metadata: {
          authority: COMMUNITY_REPUTATION_SCORING_CONSENT_POLICY,
          consentVersion: COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION,
          principalFingerprint,
          expectedRevision: input.expectedRevision,
          revision: toNumber(updated.rows[0].revision),
          reputationScoringEnabled: input.enabled,
        },
      });

      return {
        kind: "success" as const,
        changed: true,
        replayed: false,
        consent: mapConsent(updated.rows[0]),
      };
    });

    if (!result.enabled) return { ok: false, reason: "unavailable" };
    if (result.value.kind === "not_found") {
      return { ok: false, reason: "not_found" };
    }
    if (result.value.kind === "revision_conflict") {
      return { ok: false, reason: "revision_conflict" };
    }
    if (result.value.kind === "idempotency_conflict") {
      return { ok: false, reason: "idempotency_conflict" };
    }
    return {
      ok: true,
      changed: result.value.changed,
      replayed: result.value.replayed,
      consent: result.value.consent,
    };
  } catch (error) {
    logger.error("[community-reputation-scoring-consent] update failed", {
      principalFingerprint,
      error: String(error),
    });
    return { ok: false, reason: "unavailable" };
  }
}
