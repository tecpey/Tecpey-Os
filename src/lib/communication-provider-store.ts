import type { PoolClient } from "pg";
import { writeAdminAuditEvent } from "./admin-control-plane";
import { withDb, withTx } from "./db";
import { PLATFORM } from "./platform-config";
import {
  decryptCommunicationProviderSecret,
  encryptCommunicationProviderSecret,
  providerSecretFingerprint,
} from "./security/communication-provider-secret";

export const COMMUNICATION_PROVIDER_IDS = ["limoo_sms", "resend", "sendgrid"] as const;
export type CommunicationProviderId = typeof COMMUNICATION_PROVIDER_IDS[number];

export type CommunicationProviderSettings = {
  otpFooter?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  defaultTemplateId?: string;
};

export type CommunicationProviderSnapshot = {
  providerId: CommunicationProviderId;
  enabled: boolean;
  secretConfigured: boolean;
  keyFingerprint: string | null;
  settings: CommunicationProviderSettings;
  revision: number;
  rotatedAt: string | null;
  lastTestStatus: "passed" | "failed" | null;
  lastTestedAt: string | null;
  updatedAt: string | null;
};

type ProviderRow = {
  provider_id: CommunicationProviderId;
  enabled: boolean;
  encrypted_api_key: string | null;
  api_key_fingerprint: string | null;
  settings: unknown;
  revision: string | number;
  rotated_at: string | Date | null;
  last_test_status: "passed" | "failed" | null;
  last_tested_at: string | Date | null;
  updated_at: string | Date;
};

export type RuntimeCommunicationProvider = {
  providerId: CommunicationProviderId;
  apiKey: string;
  settings: CommunicationProviderSettings;
};

export type RuntimeProviderResolution =
  | { status: "configured"; config: RuntimeCommunicationProvider }
  | { status: "disabled" | "unconfigured" | "unavailable"; config: null };

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function cleanSettings(value: unknown): CommunicationProviderSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const output: CommunicationProviderSettings = {};
  for (const key of ["otpFooter", "fromName", "fromEmail", "replyTo", "defaultTemplateId"] as const) {
    if (typeof source[key] === "string") output[key] = source[key].slice(0, 320);
  }
  return output;
}

function snapshot(row: ProviderRow): CommunicationProviderSnapshot {
  return {
    providerId: row.provider_id,
    enabled: row.enabled,
    secretConfigured: Boolean(row.encrypted_api_key),
    keyFingerprint: row.api_key_fingerprint,
    settings: cleanSettings(row.settings),
    revision: Number(row.revision),
    rotatedAt: iso(row.rotated_at),
    lastTestStatus: row.last_test_status,
    lastTestedAt: iso(row.last_tested_at),
    updatedAt: iso(row.updated_at),
  };
}

function emptySnapshot(providerId: CommunicationProviderId): CommunicationProviderSnapshot {
  return {
    providerId,
    enabled: false,
    secretConfigured: false,
    keyFingerprint: null,
    settings: {},
    revision: 0,
    rotatedAt: null,
    lastTestStatus: null,
    lastTestedAt: null,
    updatedAt: null,
  };
}

function scope(tenantId: string, workspaceId: string, providerId: CommunicationProviderId): string {
  return `${tenantId}:${workspaceId}:${providerId}`;
}

async function lockProviderScope(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
  providerId: CommunicationProviderId,
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [scope(tenantId, workspaceId, providerId)],
  );
}

async function selectProvider(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
  providerId: CommunicationProviderId,
  lock = false,
): Promise<ProviderRow | null> {
  const result = await client.query<ProviderRow>(
    `SELECT provider_id, enabled, encrypted_api_key, api_key_fingerprint, settings,
            revision, rotated_at, last_test_status, last_tested_at, updated_at
       FROM communication_provider_configs
      WHERE tenant_id = $1 AND workspace_id = $2 AND provider_id = $3
      ${lock ? "FOR UPDATE" : ""}`,
    [tenantId, workspaceId, providerId],
  );
  return result.rows[0] ?? null;
}

export async function loadCommunicationProviderSnapshots(input: {
  tenantId: string;
  workspaceId: string;
}): Promise<CommunicationProviderSnapshot[] | "unavailable"> {
  const result = await withDb(async (client) => {
    const rows = await client.query<ProviderRow>(
      `SELECT provider_id, enabled, encrypted_api_key, api_key_fingerprint, settings,
              revision, rotated_at, last_test_status, last_tested_at, updated_at
         FROM communication_provider_configs
        WHERE tenant_id = $1 AND workspace_id = $2`,
      [input.tenantId, input.workspaceId],
    );
    const byProvider = new Map(rows.rows.map((row) => [row.provider_id, snapshot(row)]));
    return COMMUNICATION_PROVIDER_IDS.map((providerId) => byProvider.get(providerId) ?? emptySnapshot(providerId));
  });
  return result.enabled ? result.value : "unavailable";
}

export async function resolveRuntimeCommunicationProvider(
  providerId: CommunicationProviderId,
  input: { tenantId?: string; workspaceId?: string } = {},
): Promise<RuntimeProviderResolution> {
  const tenantId = input.tenantId ?? PLATFORM.DEFAULT_TENANT_ID;
  const workspaceId = input.workspaceId ?? PLATFORM.DEFAULT_WORKSPACE_ID;
  try {
    const result = await withDb((client) => selectProvider(client, tenantId, workspaceId, providerId));
    if (!result.enabled) return { status: "unavailable", config: null };
    const row = result.value;
    if (!row) return { status: "unconfigured", config: null };
    if (!row.enabled) return { status: "disabled", config: null };
    if (!row.encrypted_api_key) return { status: "unconfigured", config: null };
    return {
      status: "configured",
      config: {
        providerId,
        apiKey: decryptCommunicationProviderSecret(
          row.encrypted_api_key,
          scope(tenantId, workspaceId, providerId),
        ),
        settings: cleanSettings(row.settings),
      },
    };
  } catch {
    return { status: "unavailable", config: null };
  }
}

export type UpdateCommunicationProviderInput = {
  tenantId: string;
  workspaceId: string;
  actorAdminId: string;
  sessionId: string;
  effectiveRoles: string[];
  providerId: CommunicationProviderId;
  enabled: boolean;
  apiKey?: string;
  settings: CommunicationProviderSettings;
  requestId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
};

export async function updateCommunicationProvider(
  input: UpdateCommunicationProviderInput,
): Promise<CommunicationProviderSnapshot | "secret_required" | "unavailable"> {
  try {
    const result = await withTx(async (client) => {
      await lockProviderScope(client, input.tenantId, input.workspaceId, input.providerId);
      const before = await selectProvider(client, input.tenantId, input.workspaceId, input.providerId, true);
      const apiKey = input.apiKey?.trim();
      const encrypted = apiKey
        ? encryptCommunicationProviderSecret(apiKey, scope(input.tenantId, input.workspaceId, input.providerId))
        : before?.encrypted_api_key ?? null;
      const fingerprint = apiKey
        ? providerSecretFingerprint(apiKey)
        : before?.api_key_fingerprint ?? null;
      if (input.enabled && !encrypted) return "secret_required" as const;

      const revision = Number(before?.revision ?? 0) + 1;
      const rotatedAt = apiKey ? new Date().toISOString() : iso(before?.rotated_at ?? null);
      const updated = await client.query<ProviderRow>(
        `INSERT INTO communication_provider_configs
           (tenant_id, workspace_id, provider_id, enabled, encrypted_api_key,
            api_key_fingerprint, settings, revision, rotated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::timestamptz, $10::uuid)
         ON CONFLICT (tenant_id, workspace_id, provider_id) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           encrypted_api_key = EXCLUDED.encrypted_api_key,
           api_key_fingerprint = EXCLUDED.api_key_fingerprint,
           settings = EXCLUDED.settings,
           revision = EXCLUDED.revision,
           rotated_at = EXCLUDED.rotated_at,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING provider_id, enabled, encrypted_api_key, api_key_fingerprint,
                   settings, revision, rotated_at, last_test_status, last_tested_at, updated_at`,
        [
          input.tenantId,
          input.workspaceId,
          input.providerId,
          input.enabled,
          encrypted,
          fingerprint,
          JSON.stringify(input.settings),
          revision,
          rotatedAt,
          input.actorAdminId,
        ],
      );
      const row = updated.rows[0];
      const eventType = apiKey
        ? before?.encrypted_api_key ? "rotated" : "configured"
        : before?.enabled !== input.enabled ? input.enabled ? "enabled" : "disabled" : "configured";
      await client.query(
        `INSERT INTO communication_provider_config_events
           (tenant_id, workspace_id, provider_id, event_type, revision,
            api_key_fingerprint, settings_snapshot, actor_admin_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::uuid)`,
        [input.tenantId, input.workspaceId, input.providerId, eventType, revision,
          fingerprint, JSON.stringify(input.settings), input.actorAdminId],
      );
      const after = snapshot(row);
      await writeAdminAuditEvent(client, {
        actorAdminId: input.actorAdminId,
        sessionId: input.sessionId,
        effectiveRoles: input.effectiveRoles,
        action: `communication_provider.${eventType}`,
        resourceType: "communication_provider",
        resourceId: input.providerId,
        requestId: input.requestId,
        sourceIp: input.sourceIp,
        userAgent: input.userAgent,
        beforeState: before ? snapshot(before) : null,
        afterState: after,
      });
      return after;
    });
    return result.enabled ? result.value : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function recordCommunicationProviderTest(input: {
  tenantId: string;
  workspaceId: string;
  actorAdminId: string;
  sessionId: string;
  effectiveRoles: string[];
  providerId: CommunicationProviderId;
  passed: boolean;
  requestId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
}): Promise<boolean> {
  try {
    const result = await withTx(async (client) => {
      await lockProviderScope(client, input.tenantId, input.workspaceId, input.providerId);
      const row = await selectProvider(client, input.tenantId, input.workspaceId, input.providerId, true);
      if (!row) return false;
      const status = input.passed ? "passed" : "failed";
      await client.query(
        `UPDATE communication_provider_configs
            SET last_test_status = $4, last_tested_at = NOW(), updated_at = NOW()
          WHERE tenant_id = $1 AND workspace_id = $2 AND provider_id = $3`,
        [input.tenantId, input.workspaceId, input.providerId, status],
      );
      await client.query(
        `INSERT INTO communication_provider_config_events
           (tenant_id, workspace_id, provider_id, event_type, revision,
            api_key_fingerprint, settings_snapshot, actor_admin_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::uuid)`,
        [input.tenantId, input.workspaceId, input.providerId,
          input.passed ? "test_passed" : "test_failed", Number(row.revision),
          row.api_key_fingerprint, JSON.stringify(cleanSettings(row.settings)), input.actorAdminId],
      );
      await writeAdminAuditEvent(client, {
        actorAdminId: input.actorAdminId,
        sessionId: input.sessionId,
        effectiveRoles: input.effectiveRoles,
        action: input.passed ? "communication_provider.test_passed" : "communication_provider.test_failed",
        resourceType: "communication_provider",
        resourceId: input.providerId,
        requestId: input.requestId,
        sourceIp: input.sourceIp,
        userAgent: input.userAgent,
        afterState: { testStatus: status, revision: Number(row.revision) },
        outcome: input.passed ? "success" : "failed",
        errorCode: input.passed ? null : "provider_test_failed",
      });
      return true;
    });
    return result.enabled && result.value;
  } catch {
    return false;
  }
}


export async function recordCommunicationProviderOperation(input: {
  tenantId: string;
  workspaceId: string;
  actorAdminId: string;
  sessionId: string;
  effectiveRoles: string[];
  providerId: CommunicationProviderId;
  operation: string;
  passed: boolean;
  metadata?: Record<string, string | number | boolean>;
  requestId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
}): Promise<boolean> {
  try {
    const result = await withTx(async (client) => {
      const row = await selectProvider(
        client,
        input.tenantId,
        input.workspaceId,
        input.providerId,
      );
      if (!row) return false;
      await writeAdminAuditEvent(client, {
        actorAdminId: input.actorAdminId,
        sessionId: input.sessionId,
        effectiveRoles: input.effectiveRoles,
        action: `communication_provider.${input.operation}`,
        resourceType: "communication_provider",
        resourceId: input.providerId,
        requestId: input.requestId,
        sourceIp: input.sourceIp,
        userAgent: input.userAgent,
        afterState: {
          operation: input.operation,
          passed: input.passed,
          revision: Number(row.revision),
          ...(input.metadata ?? {}),
        },
        outcome: input.passed ? "success" : "failed",
        errorCode: input.passed ? null : "provider_operation_failed",
      });
      return true;
    });
    return result.enabled && result.value;
  } catch {
    return false;
  }
}
