import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { enqueueNotificationDomainEvent } from "@/lib/notifications/domain-outbox";
import { createPublicCredentialId } from "@/lib/public-credential-verification-id";

export type AcademyCredentialScope = {
  tenantId: string;
  workspaceId: string;
  studentId: string;
};

export type AcademyCredentialType =
  | "achievement"
  | "certificate"
  | "competition_medal"
  | "league_medal"
  | "mastery_season";
export type AcademyCredentialVisibility = "private" | "profile" | "public";

export type OwnedAcademyCredentialHistoryEvent = {
  credential_id: string;
  event_kind: "lifecycle" | "visibility";
  state: string;
  reason: string;
  actor_type: string;
  occurred_at: Date | string;
};

export type IssueAcademyCredentialInput = AcademyCredentialScope & {
  credentialKey: string;
  credentialType: AcademyCredentialType;
  code: string;
  titleFa: string;
  titleEn: string;
  descriptionFa: string;
  descriptionEn: string;
  icon: string;
  policyVersion: string;
  evidence: Record<string, unknown>;
  issuedAt: string;
  competitionId?: string;
  seasonKey?: string;
  rank?: number;
  pointsBps?: number;
};

function canonicalEvidence(value: Record<string, unknown>): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sort(nested)]));
  };
  return JSON.stringify(sort(value));
}

export async function listOwnedAcademyCredentials(
  client: PoolClient,
  scope: AcademyCredentialScope,
) {
  const result = await client.query(
    `SELECT id, credential_key, credential_type, code,
            title_fa, title_en, description_fa, description_en, icon, issuer,
            competition_id, season_key, rank, points_bps, policy_version,
            issued_at, expires_at, lifecycle_state, lifecycle_reason,
            lifecycle_changed_at, visibility, visibility_changed_at
       FROM academy_credential_current_state
      WHERE tenant_id = $1 AND workspace_id = $2 AND student_id = $3::uuid
      ORDER BY issued_at DESC, id DESC`,
    [scope.tenantId, scope.workspaceId, scope.studentId],
  );
  return result.rows.map((row) => ({
    ...row,
    public_id: createPublicCredentialId(String(row.id ?? "")),
  }));
}

export async function listOwnedAcademyCredentialHistory(
  client: PoolClient,
  scope: AcademyCredentialScope,
): Promise<OwnedAcademyCredentialHistoryEvent[]> {
  const result = await client.query<OwnedAcademyCredentialHistoryEvent>(
    `SELECT credential_id, event_kind, state, reason, actor_type, occurred_at
       FROM (
         SELECT history.*,
                ROW_NUMBER() OVER (
                  PARTITION BY credential_id
                  ORDER BY occurred_at DESC, event_sequence DESC
                ) AS credential_event_rank
           FROM (
         SELECT record.id::text AS credential_id,
                'lifecycle'::text AS event_kind,
                event.event_type AS state,
                event.reason_code AS reason,
                event.actor_type,
                event.occurred_at,
                event.event_sequence
           FROM academy_credential_events event
           JOIN academy_credential_records record ON record.id = event.credential_id
          WHERE record.tenant_id = $1 AND record.workspace_id = $2
            AND record.student_id = $3::uuid
         UNION ALL
         SELECT record.id::text AS credential_id,
                'visibility'::text AS event_kind,
                event.visibility AS state,
                event.source AS reason,
                'student'::text AS actor_type,
                event.occurred_at,
                event.event_sequence
           FROM academy_credential_visibility_events event
           JOIN academy_credential_records record ON record.id = event.credential_id
          WHERE record.tenant_id = $1 AND record.workspace_id = $2
            AND record.student_id = $3::uuid
       ) history
       ) ranked_history
      WHERE credential_event_rank <= 6
      ORDER BY occurred_at DESC, event_sequence DESC
      `,
    [scope.tenantId, scope.workspaceId, scope.studentId],
  );
  return result.rows;
}

export async function setOwnedAcademyCredentialVisibility(
  client: PoolClient,
  input: AcademyCredentialScope & {
    credentialId: string;
    visibility: AcademyCredentialVisibility;
    idempotencyKey: string;
  },
): Promise<{ visibility: AcademyCredentialVisibility; replayed: boolean; occurredAt: string } | null> {
  const inserted = await client.query<{
    visibility: AcademyCredentialVisibility;
    occurred_at: Date | string;
  }>(
    `INSERT INTO academy_credential_visibility_events
       (credential_id, visibility, actor_student_id, policy_version,
        source, idempotency_key, metadata)
     SELECT id, $5, $3::uuid, 'academy-credential-visibility-v1',
            'credential_cabinet', $6, '{}'::jsonb
       FROM academy_credential_current_state
      WHERE id = $4::uuid AND tenant_id = $1 AND workspace_id = $2
        AND student_id = $3::uuid
        AND ($5 <> 'public' OR (
          lifecycle_state IN ('issued', 'reinstated')
          AND (expires_at IS NULL OR expires_at > NOW())
        ))
     ON CONFLICT (credential_id, idempotency_key) DO NOTHING
     RETURNING visibility, occurred_at`,
    [input.tenantId, input.workspaceId, input.studentId, input.credentialId,
      input.visibility, input.idempotencyKey],
  );
  if (inserted.rows[0]) return {
    visibility: inserted.rows[0].visibility,
    replayed: false,
    occurredAt: new Date(inserted.rows[0].occurred_at).toISOString(),
  };

  const existing = await client.query<{
    visibility: AcademyCredentialVisibility;
    occurred_at: Date | string;
  }>(
    `SELECT event.visibility, event.occurred_at
       FROM academy_credential_visibility_events event
       JOIN academy_credential_records record ON record.id = event.credential_id
      WHERE record.id = $4::uuid AND record.tenant_id = $1
        AND record.workspace_id = $2 AND record.student_id = $3::uuid
        AND event.idempotency_key = $5
      FOR SHARE OF event`,
    [input.tenantId, input.workspaceId, input.studentId, input.credentialId,
      input.idempotencyKey],
  );
  if (!existing.rows[0]) return null;
  if (existing.rows[0].visibility !== input.visibility) {
    throw new Error("academy_credential_visibility_identity_conflict");
  }
  return {
    visibility: existing.rows[0].visibility,
    replayed: true,
    occurredAt: new Date(existing.rows[0].occurred_at).toISOString(),
  };
}

/**
 * Trusted orchestration boundary. Call this with a client already owned by
 * `withTx`; the credential, lifecycle event and notification must commit or
 * roll back as one unit. This function is intentionally not exposed by a
 * student-facing mutation route.
 */
export async function issueAcademyCredential(
  client: PoolClient,
  input: IssueAcademyCredentialInput,
): Promise<{ credentialId: string; replayed: boolean }> {
  const evidenceJson = canonicalEvidence(input.evidence);
  const evidenceSha256 = createHash("sha256").update(evidenceJson).digest("hex");
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO academy_credential_records
       (tenant_id, workspace_id, student_id, credential_key, credential_type,
        code, title_fa, title_en, description_fa, description_en, icon,
        competition_id, season_key, rank, points_bps, policy_version,
        evidence_sha256, evidence, issued_at)
     VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11,
             $12, $13, $14, $15, $16, $17, $18::jsonb, $19::timestamptz)
     ON CONFLICT (tenant_id, workspace_id, student_id, credential_key) DO NOTHING
     RETURNING id`,
    [input.tenantId, input.workspaceId, input.studentId, input.credentialKey,
      input.credentialType, input.code, input.titleFa, input.titleEn,
      input.descriptionFa, input.descriptionEn, input.icon,
      input.competitionId ?? null, input.seasonKey ?? null, input.rank ?? null,
      input.pointsBps ?? null, input.policyVersion, evidenceSha256, evidenceJson,
      input.issuedAt],
  );

  if (!inserted.rows[0]) {
    const existing = await client.query<{
      id: string;
      credential_type: AcademyCredentialType;
      code: string;
      title_fa: string;
      title_en: string;
      description_fa: string;
      description_en: string;
      icon: string;
      competition_id: string | null;
      season_key: string | null;
      rank: number | null;
      points_bps: number | null;
      policy_version: string;
      evidence_sha256: string;
      issued_at: Date | string;
    }>(
      `SELECT id, credential_type, code, title_fa, title_en,
              description_fa, description_en, icon, competition_id,
              season_key, rank, points_bps, policy_version, evidence_sha256,
              issued_at
         FROM academy_credential_records
        WHERE tenant_id = $1 AND workspace_id = $2 AND student_id = $3::uuid
          AND credential_key = $4 FOR UPDATE`,
      [input.tenantId, input.workspaceId, input.studentId, input.credentialKey],
    );
    const row = existing.rows[0];
    if (!row) throw new Error("academy_credential_conflict_missing");
    const isExactReplay = row.credential_type === input.credentialType
      && row.code === input.code
      && row.title_fa === input.titleFa
      && row.title_en === input.titleEn
      && row.description_fa === input.descriptionFa
      && row.description_en === input.descriptionEn
      && row.icon === input.icon
      && row.competition_id === (input.competitionId ?? null)
      && row.season_key === (input.seasonKey ?? null)
      && row.rank === (input.rank ?? null)
      && row.points_bps === (input.pointsBps ?? null)
      && row.policy_version === input.policyVersion
      && row.evidence_sha256 === evidenceSha256
      && new Date(row.issued_at).toISOString() === new Date(input.issuedAt).toISOString();
    if (!isExactReplay) throw new Error("academy_credential_identity_conflict");
    return { credentialId: row.id, replayed: true };
  }

  const credentialId = inserted.rows[0].id;
  await client.query(
    `INSERT INTO academy_credential_events
       (credential_id, event_type, actor_type, actor_id, reason_code,
        policy_version, evidence_sha256, metadata, occurred_at, idempotency_key)
     VALUES ($1, 'issued', 'system', 'academy-credential-authority',
             'policy.verified', $2, $3, '{}'::jsonb, $4::timestamptz, $5)`,
    [credentialId, input.policyVersion, evidenceSha256, input.issuedAt,
      `issued:${credentialId}`],
  );
  const principal = await client.query<{ id: string; locale: "fa" | "en" }>(
    `SELECT id, locale FROM platform_principals
      WHERE tenant_id = $1 AND student_id = $2::uuid
        AND status = 'active'
      LIMIT 1 FOR SHARE`,
    [input.tenantId, input.studentId],
  );
  if (!principal.rows[0]) throw new Error("academy_credential_principal_not_found");
  await enqueueNotificationDomainEvent(client, {
    id: `credential:${credentialId}`,
    tenantId: input.tenantId,
    principalId: principal.rows[0].id,
    occurredAt: new Date(input.issuedAt).toISOString(),
    locale: principal.rows[0].locale,
    version: 1,
    type: "academy.credential_issued",
    payload: {
      credentialId,
      credentialType: input.credentialType,
      titleFa: input.titleFa,
      titleEn: input.titleEn,
      rank: input.rank ?? null,
      seasonKey: input.seasonKey ?? null,
    },
  });
  return { credentialId, replayed: false };
}
