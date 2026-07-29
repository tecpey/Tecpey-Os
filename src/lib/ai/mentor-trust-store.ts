import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withDb, withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { PLATFORM } from "@/lib/platform-config";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveMutationAuditEvent,
} from "@/lib/security/sensitive-mutation-audit";
import type { MentorDataClass } from "./mentor-trust-boundary";

export type MentorAiPreferences = {
  externalProviderEnabled: boolean;
  behavioralPersonalizationEnabled: boolean;
  realExchangeSignalsEnabled: boolean;
  consentVersion: string;
  consentedAt: string | null;
};

export type MentorAiPreferenceLoad = {
  available: boolean;
  preferences: MentorAiPreferences;
};

export type MentorPreferenceAuditContext = Pick<
  SensitiveMutationAuditEvent,
  "tenantId" | "actorType" | "actorId" | "correlationId" | "requestHash"
>;

export type MentorPreferenceUpdateResult =
  | { ok: true; changed: boolean; preferences: MentorAiPreferences }
  | { ok: false };

export type MentorEvidenceInput = {
  requestId: string;
  studentId: string | null;
  phase: "blocked" | "local" | "admitted" | "completed";
  provider: "none" | "openai";
  model?: string | null;
  policyVersion: string;
  contextClasses: MentorDataClass[];
  redactionCount: number;
  injectionSignalCount: number;
  inputHash: string;
  inputChars: number;
  estimatedInputTokens: number;
  estimatedOutputTokens?: number;
  outcome:
    | "blocked_secret"
    | "local_guidance"
    | "provider_admitted"
    | "provider_success"
    | "provider_failure"
    | "provider_timeout"
    | "provider_circuit_open"
    | "output_rejected"
    | "evidence_unavailable";
  memoryPersisted?: boolean | null;
  metadata?: Record<string, unknown>;
};

export type MentorConversationPairInput = {
  requestId: string;
  studentId: string;
  question: string;
  answer: string;
  locale: "fa" | "en";
  termNumber?: number;
  contentClass?: "personal" | "financial_sensitive";
};

const MENTOR_CONSENT_VERSION = "2026-07-20.1";
const MENTOR_PREFERENCE_POLICY_VERSION = "mentor-preferences-consent-v1";

const DEFAULT_PREFERENCES: MentorAiPreferences = {
  externalProviderEnabled: true,
  behavioralPersonalizationEnabled: false,
  realExchangeSignalsEnabled: false,
  consentVersion: MENTOR_CONSENT_VERSION,
  consentedAt: null,
};

type PreferenceRow = {
  external_provider_enabled: boolean;
  behavioral_personalization_enabled: boolean;
  real_exchange_signals_enabled: boolean;
  consent_version: string;
  consented_at: Date | string | null;
};

function mapPreferences(row: PreferenceRow): MentorAiPreferences {
  return {
    externalProviderEnabled: row.external_provider_enabled,
    behavioralPersonalizationEnabled: row.behavioral_personalization_enabled,
    realExchangeSignalsEnabled: row.real_exchange_signals_enabled,
    consentVersion: row.consent_version,
    consentedAt: row.consented_at
      ? new Date(row.consented_at).toISOString()
      : null,
  };
}

export function fingerprintMentorPreferenceStudent(studentId: string): string {
  return createHash("sha256")
    .update("tecpey-mentor-preference-student-v1\0")
    .update(studentId)
    .digest("hex");
}

function assertPreferenceAudit(
  studentId: string,
  audit: MentorPreferenceAuditContext,
): void {
  if (!studentId || audit.actorId !== studentId) {
    throw new Error("mentor_preference_audit_actor_mismatch");
  }
  if (audit.actorType !== "student") {
    throw new Error("mentor_preference_audit_actor_type_invalid");
  }
}

export async function loadMentorAiPreferences(
  studentId: string,
): Promise<MentorAiPreferenceLoad> {
  try {
    const result = await withDb(async (client) => {
      const preference = await client.query<PreferenceRow>(
        `SELECT external_provider_enabled,
                behavioral_personalization_enabled,
                real_exchange_signals_enabled,
                consent_version,
                consented_at
           FROM mentor_ai_preferences
          WHERE student_id = $1::uuid
          LIMIT 1`,
        [studentId],
      );
      return preference.rows[0]
        ? mapPreferences(preference.rows[0])
        : DEFAULT_PREFERENCES;
    });
    return result.enabled
      ? { available: true, preferences: result.value }
      : { available: false, preferences: DEFAULT_PREFERENCES };
  } catch (error) {
    logger.error("[mentor-trust-store] preference load failed", {
      studentFingerprint: fingerprintMentorPreferenceStudent(studentId),
      error: String(error),
    });
    return { available: false, preferences: DEFAULT_PREFERENCES };
  }
}

export async function setMentorAiPreferences(input: {
  studentId: string;
  externalProviderEnabled: boolean;
  behavioralPersonalizationEnabled: boolean;
  audit: MentorPreferenceAuditContext;
}): Promise<MentorPreferenceUpdateResult> {
  assertPreferenceAudit(input.studentId, input.audit);
  const studentFingerprint = fingerprintMentorPreferenceStudent(input.studentId);

  try {
    const result = await withTx(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `mentor-ai-preferences:${input.studentId}`,
      ]);
      const existingResult = await client.query<PreferenceRow>(
        `SELECT external_provider_enabled,
                behavioral_personalization_enabled,
                real_exchange_signals_enabled,
                consent_version,
                consented_at
           FROM mentor_ai_preferences
          WHERE student_id = $1::uuid
          FOR UPDATE`,
        [input.studentId],
      );
      const existing = existingResult.rows[0] ?? null;
      if (
        existing &&
        existing.external_provider_enabled === input.externalProviderEnabled &&
        existing.behavioral_personalization_enabled ===
          input.behavioralPersonalizationEnabled &&
        existing.real_exchange_signals_enabled === false &&
        existing.consent_version === MENTOR_CONSENT_VERSION
      ) {
        return {
          changed: false,
          preferences: mapPreferences(existing),
        };
      }

      const updated = await client.query<PreferenceRow>(
        `INSERT INTO mentor_ai_preferences
          (student_id,
           external_provider_enabled,
           behavioral_personalization_enabled,
           real_exchange_signals_enabled,
           consent_version,
           consented_at,
           updated_at)
         VALUES ($1::uuid, $2, $3, FALSE, $4, NOW(), NOW())
         ON CONFLICT (student_id) DO UPDATE
           SET external_provider_enabled = EXCLUDED.external_provider_enabled,
               behavioral_personalization_enabled = EXCLUDED.behavioral_personalization_enabled,
               real_exchange_signals_enabled = FALSE,
               consent_version = EXCLUDED.consent_version,
               consented_at = NOW(),
               updated_at = NOW()
         RETURNING external_provider_enabled,
                   behavioral_personalization_enabled,
                   real_exchange_signals_enabled,
                   consent_version,
                   consented_at`,
        [
          input.studentId,
          input.externalProviderEnabled,
          input.behavioralPersonalizationEnabled,
          MENTOR_CONSENT_VERSION,
        ],
      );
      const preferences = mapPreferences(updated.rows[0]);
      await writeSensitiveMutationAuditTx(client, {
        ...input.audit,
        action: "mentor.preferences.update",
        resourceType: "mentor_ai_preferences",
        resourceId: input.studentId,
        outcome: "success",
        metadata: {
          policyVersion: MENTOR_PREFERENCE_POLICY_VERSION,
          studentFingerprint,
          externalProviderEnabled: preferences.externalProviderEnabled,
          behavioralPersonalizationEnabled:
            preferences.behavioralPersonalizationEnabled,
          realExchangeSignalsEnabled: false,
          consentVersion: preferences.consentVersion,
        },
      });
      return { changed: true, preferences };
    });

    return result.enabled
      ? { ok: true, ...result.value }
      : { ok: false };
  } catch (error) {
    logger.error("[mentor-trust-store] preference update failed", {
      studentFingerprint,
      error: String(error),
    });
    return { ok: false };
  }
}

function evidenceMetadata(value: Record<string, unknown> | undefined): string {
  const serialized = JSON.stringify(value ?? {});
  if (serialized.length > 8_000) throw new Error("mentor_evidence_metadata_too_large");
  return serialized;
}

export async function appendAiMentorEvidence(
  input: MentorEvidenceInput,
  client?: PoolClient,
): Promise<boolean> {
  const insert = async (db: PoolClient) => {
    await db.query(
      `INSERT INTO ai_mentor_request_evidence
        (tenant_id,
         request_id,
         student_id,
         phase,
         provider,
         model,
         policy_version,
         context_classes,
         redaction_count,
         injection_signal_count,
         input_hash,
         input_chars,
         estimated_input_tokens,
         estimated_output_tokens,
         outcome,
         memory_persisted,
         metadata)
       VALUES
        ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::text[],
         $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)`,
      [
        PLATFORM.DEFAULT_TENANT_ID,
        input.requestId,
        input.studentId,
        input.phase,
        input.provider,
        input.model ?? null,
        input.policyVersion,
        input.contextClasses,
        Math.max(0, Math.trunc(input.redactionCount)),
        Math.max(0, Math.trunc(input.injectionSignalCount)),
        input.inputHash,
        Math.max(0, Math.trunc(input.inputChars)),
        Math.max(0, Math.trunc(input.estimatedInputTokens)),
        Math.max(0, Math.trunc(input.estimatedOutputTokens ?? 0)),
        input.outcome,
        input.memoryPersisted ?? null,
        evidenceMetadata(input.metadata),
      ],
    );
    return true;
  };

  try {
    if (client) return insert(client);
    const result = await withDb(insert);
    return result.enabled && result.value;
  } catch (error) {
    logger.error("[mentor-trust-store] evidence append failed", {
      requestId: input.requestId,
      phase: input.phase,
      error: String(error),
    });
    return false;
  }
}

export async function persistMentorConversationPair(
  input: MentorConversationPairInput,
): Promise<boolean> {
  try {
    const transaction = await withTx(async (client) => {
      await client.query(
        `INSERT INTO mentor_conversations
          (student_id, request_id, role, content, locale, term_number,
           content_class, retention_class)
         VALUES
          ($1::uuid, $2::uuid, 'user', $3, $4, $5, $6, 'mentor_history_90d'),
          ($1::uuid, $2::uuid, 'assistant', $7, $4, $5, 'personal', 'mentor_history_90d')`,
        [
          input.studentId,
          input.requestId,
          input.question,
          input.locale,
          input.termNumber ?? null,
          input.contentClass ?? "personal",
          input.answer,
        ],
      );
      await client.query(
        `DELETE FROM mentor_conversations
          WHERE student_id = $1::uuid
            AND id NOT IN (
              SELECT id
                FROM mentor_conversations
               WHERE student_id = $1::uuid
               ORDER BY created_at DESC, id DESC
               LIMIT 200
            )`,
        [input.studentId],
      );
      return true;
    });
    return transaction.enabled && transaction.value;
  } catch (error) {
    logger.error("[mentor-trust-store] conversation pair persistence failed", {
      requestId: input.requestId,
      studentFingerprint: fingerprintMentorPreferenceStudent(input.studentId),
      error: String(error),
    });
    return false;
  }
}
