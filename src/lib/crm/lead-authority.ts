import { createHash, createHmac, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  decryptLeadPii,
  encryptLeadPii,
  hashLeadValue,
  leadContactHash,
  normalizeLeadEmail,
  normalizeLeadPhone,
  type LeadPii,
} from "./lead-pii";

export type AcademyLeadCommand = {
  tenantId: string;
  idempotencyKey: string;
  leadKind: "academy_interest" | "academy_specialized";
  source: string;
  campaign?: string;
  locale: "fa" | "en";
  pii: LeadPii;
  attributes: Record<string, unknown>;
  consent: true;
  legalBasis: "consent" | "pre_contract";
  privacyNoticeVersion: string;
  networkFingerprint?: string | null;
};

export type AcademyLeadResult = {
  id: string;
  created: boolean;
  replayed: boolean;
  revision: number;
};

export type DeliveryClaim = {
  id: string;
  lead_id: string;
  tenant_id: string;
  lead_revision: number;
  attempt_count: number;
  max_attempts: number;
};

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return "null";
}

export function hashAcademyLeadCommand(command: AcademyLeadCommand): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        leadKind: command.leadKind,
        source: command.source,
        campaign: command.campaign ?? null,
        locale: command.locale,
        pii: {
          name: command.pii.name,
          phone: normalizeLeadPhone(command.pii.phone),
          email: normalizeLeadEmail(command.pii.email),
          city: command.pii.city ?? "",
          note: command.pii.note ?? "",
        },
        attributes: command.attributes,
        consent: command.consent,
        legalBasis: command.legalBasis,
        privacyNoticeVersion: command.privacyNoticeVersion,
      }),
    )
    .digest("hex");
}

async function appendAudit(
  client: PoolClient,
  input: {
    tenantId: string;
    leadId: string;
    action:
      | "created"
      | "updated"
      | "delivery_claimed"
      | "delivery_succeeded"
      | "delivery_failed"
      | "exported"
      | "deleted"
      | "retention_deleted";
    actorType: "public" | "worker" | "admin" | "retention";
    actorId?: string | null;
    networkFingerprint?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO crm_lead_audit_events
      (tenant_id, lead_id, action, actor_type, actor_id, network_fingerprint, metadata)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::jsonb)`,
    [
      input.tenantId,
      input.leadId,
      input.action,
      input.actorType,
      input.actorId ?? null,
      input.networkFingerprint ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

function resultFromJson(value: unknown): AcademyLeadResult {
  const row = value as Partial<AcademyLeadResult>;
  if (!row.id || !Number.isInteger(row.revision)) {
    throw new Error("crm_lead_command_result_invalid");
  }
  return {
    id: row.id,
    created: Boolean(row.created),
    replayed: true,
    revision: Number(row.revision),
  };
}

export async function ingestAcademyLead(
  command: AcademyLeadCommand,
): Promise<
  | { status: "committed"; result: AcademyLeadResult }
  | { status: "conflict" }
  | { status: "unavailable" }
> {
  const requestHash = hashAcademyLeadCommand(command);
  const phone = normalizeLeadPhone(command.pii.phone);
  const email = normalizeLeadEmail(command.pii.email);
  const contactHash = leadContactHash(phone);
  const phoneHash = hashLeadValue(phone);
  const emailHash = email ? hashLeadValue(email) : null;

  try {
    const transaction = await withTx(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `crm-contact:${command.tenantId}:${command.leadKind}:${contactHash}`,
      ]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `crm-command:${command.tenantId}:${command.idempotencyKey}`,
      ]);

      const existingCommand = await client.query<{
        request_hash: string;
        result: AcademyLeadResult;
      }>(
        `SELECT request_hash, result
           FROM crm_lead_commands
          WHERE tenant_id = $1 AND idempotency_key = $2
          FOR SHARE`,
        [command.tenantId, command.idempotencyKey],
      );
      if (existingCommand.rows[0]) {
        if (existingCommand.rows[0].request_hash !== requestHash) {
          return { status: "conflict" as const };
        }
        return {
          status: "committed" as const,
          result: resultFromJson(existingCommand.rows[0].result),
        };
      }

      const existingLead = await client.query<{ id: string; revision: number }>(
        `SELECT id, revision
           FROM crm_leads
          WHERE tenant_id = $1
            AND lead_kind = $2
            AND contact_hash = $3
            AND status = 'active'
          FOR UPDATE`,
        [command.tenantId, command.leadKind, contactHash],
      );

      const created = !existingLead.rows[0];
      const leadId = existingLead.rows[0]?.id ?? randomUUID();
      const revision = (existingLead.rows[0]?.revision ?? 0) + 1;
      const encrypted = encryptLeadPii(
        { ...command.pii, phone, email: email || undefined },
        { tenantId: command.tenantId, leadId },
      );
      const retentionMonths = command.leadKind === "academy_specialized" ? 24 : 12;
      const retentionClass = retentionMonths === 24
        ? "academy_lead_24m"
        : "academy_lead_12m";

      if (created) {
        await client.query(
          `INSERT INTO crm_leads
            (id, tenant_id, lead_kind, source, campaign, contact_hash, phone_hash,
             email_hash, pii_ciphertext, pii_iv, pii_tag, pii_key_version,
             attributes, locale, consent_status, legal_basis,
             privacy_notice_version, retention_class, revision, retain_until)
           VALUES
            ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13::jsonb, $14, TRUE, $15, $16, $17, $18,
             NOW() + ($19::text || ' months')::interval)`,
          [
            leadId,
            command.tenantId,
            command.leadKind,
            command.source,
            command.campaign ?? null,
            contactHash,
            phoneHash,
            emailHash,
            encrypted.ciphertext,
            encrypted.iv,
            encrypted.tag,
            encrypted.keyVersion,
            JSON.stringify(command.attributes),
            command.locale,
            command.legalBasis,
            command.privacyNoticeVersion,
            retentionClass,
            revision,
            String(retentionMonths),
          ],
        );
      } else {
        await client.query(
          `UPDATE crm_leads
              SET source = $3,
                  campaign = $4,
                  phone_hash = $5,
                  email_hash = $6,
                  pii_ciphertext = $7,
                  pii_iv = $8,
                  pii_tag = $9,
                  pii_key_version = $10,
                  attributes = $11::jsonb,
                  locale = $12,
                  consent_status = TRUE,
                  legal_basis = $13,
                  privacy_notice_version = $14,
                  retention_class = $15,
                  revision = $16,
                  retain_until = NOW() + ($17::text || ' months')::interval,
                  updated_at = NOW()
            WHERE tenant_id = $1 AND id = $2::uuid`,
          [
            command.tenantId,
            leadId,
            command.source,
            command.campaign ?? null,
            phoneHash,
            emailHash,
            encrypted.ciphertext,
            encrypted.iv,
            encrypted.tag,
            encrypted.keyVersion,
            JSON.stringify(command.attributes),
            command.locale,
            command.legalBasis,
            command.privacyNoticeVersion,
            retentionClass,
            revision,
            String(retentionMonths),
          ],
        );
      }

      await client.query(
        `UPDATE crm_lead_delivery_outbox
            SET status = 'terminal',
                locked_at = NULL,
                locked_by = NULL,
                lease_expires_at = NULL,
                last_error_code = 'superseded_revision',
                updated_at = NOW()
          WHERE lead_id = $1::uuid
            AND destination = 'academy_webhook'
            AND status IN ('pending', 'retryable')`,
        [leadId],
      );

      await client.query(
        `INSERT INTO crm_lead_delivery_outbox
          (tenant_id, lead_id, lead_revision, destination)
         VALUES ($1, $2::uuid, $3, 'academy_webhook')
         ON CONFLICT (lead_id, lead_revision, destination) DO NOTHING`,
        [command.tenantId, leadId, revision],
      );

      await appendAudit(client, {
        tenantId: command.tenantId,
        leadId,
        action: created ? "created" : "updated",
        actorType: "public",
        networkFingerprint: command.networkFingerprint ?? null,
        metadata: {
          leadKind: command.leadKind,
          source: command.source,
          revision,
          privacyNoticeVersion: command.privacyNoticeVersion,
        },
      });

      const result: AcademyLeadResult = {
        id: leadId,
        created,
        replayed: false,
        revision,
      };
      await client.query(
        `INSERT INTO crm_lead_commands
          (tenant_id, idempotency_key, request_hash, lead_id, result)
         VALUES ($1, $2, $3, $4::uuid, $5::jsonb)`,
        [
          command.tenantId,
          command.idempotencyKey,
          requestHash,
          leadId,
          JSON.stringify(result),
        ],
      );
      return { status: "committed" as const, result };
    });

    return transaction.enabled ? transaction.value : { status: "unavailable" };
  } catch (error) {
    logger.error("[crm-lead] transactional ingestion failed", {
      tenantId: command.tenantId,
      leadKind: command.leadKind,
      source: command.source,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { status: "unavailable" };
  }
}

export async function recoverExpiredCrmLeadDeliveries(
  client: PoolClient,
  workerId: string,
  limit = 100,
): Promise<number> {
  const recovered = await client.query<DeliveryClaim & { terminal: boolean }>(
    `WITH expired AS (
       SELECT id
         FROM crm_lead_delivery_outbox
        WHERE status = 'processing'
          AND lease_expires_at <= NOW()
        ORDER BY lease_expires_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE crm_lead_delivery_outbox outbox
        SET status = CASE
              WHEN outbox.attempt_count >= outbox.max_attempts THEN 'terminal'
              ELSE 'retryable'
            END,
            available_at = NOW(),
            locked_at = NULL,
            locked_by = NULL,
            lease_expires_at = NULL,
            last_error_code = 'lease_expired',
            updated_at = NOW()
       FROM expired
      WHERE outbox.id = expired.id
      RETURNING outbox.id, outbox.lead_id, outbox.tenant_id,
                outbox.lead_revision, outbox.attempt_count,
                outbox.max_attempts,
                (outbox.status = 'terminal') AS terminal`,
    [Math.max(1, Math.min(limit, 500))],
  );

  for (const row of recovered.rows) {
    await appendAudit(client, {
      tenantId: row.tenant_id,
      leadId: row.lead_id,
      action: "delivery_failed",
      actorType: "worker",
      actorId: workerId,
      metadata: {
        deliveryId: row.id,
        revision: row.lead_revision,
        terminal: row.terminal,
        errorCode: "lease_expired",
      },
    });
  }
  return recovered.rowCount ?? 0;
}

export async function claimCrmLeadDeliveries(
  client: PoolClient,
  workerId: string,
  limit = 20,
): Promise<DeliveryClaim[]> {
  await recoverExpiredCrmLeadDeliveries(client, workerId, Math.max(limit * 2, 20));
  const bounded = Math.max(1, Math.min(limit, 100));
  const claims = await client.query<DeliveryClaim>(
    `WITH candidates AS (
       SELECT id
         FROM crm_lead_delivery_outbox
        WHERE status IN ('pending', 'retryable')
          AND available_at <= NOW()
        ORDER BY available_at, created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE crm_lead_delivery_outbox outbox
        SET status = 'processing',
            attempt_count = attempt_count + 1,
            locked_at = NOW(),
            locked_by = $2,
            lease_expires_at = NOW() + INTERVAL '2 minutes',
            updated_at = NOW()
       FROM candidates
      WHERE outbox.id = candidates.id
      RETURNING outbox.id, outbox.lead_id, outbox.tenant_id,
                outbox.lead_revision, outbox.attempt_count,
                outbox.max_attempts`,
    [bounded, workerId],
  );

  for (const claim of claims.rows) {
    await appendAudit(client, {
      tenantId: claim.tenant_id,
      leadId: claim.lead_id,
      action: "delivery_claimed",
      actorType: "worker",
      actorId: workerId,
      metadata: {
        deliveryId: claim.id,
        revision: claim.lead_revision,
        attempt: claim.attempt_count,
      },
    });
  }
  return claims.rows;
}

function webhookSecret(): string {
  const secret = process.env.TECPEY_CRM_WEBHOOK_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("crm_webhook_secret_unavailable");
  return secret;
}

export async function deliverCrmLeadClaim(
  claim: DeliveryClaim,
  workerId: string,
): Promise<void> {
  const webhookUrl = process.env.ACADEMY_LEADS_WEBHOOK_URL?.trim();
  if (!webhookUrl) throw new Error("crm_webhook_unconfigured");
  const parsedUrl = new URL(webhookUrl);
  if (parsedUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("crm_webhook_insecure");
  }

  const committed = await withTx(async (client) => {
    const loaded = await client.query<{
      lead_kind: string;
      source: string;
      campaign: string | null;
      locale: "fa" | "en";
      attributes: Record<string, unknown>;
      revision: number;
      pii_ciphertext: string;
      pii_iv: string;
      pii_tag: string;
      pii_key_version: number;
    }>(
      `SELECT lead.lead_kind, lead.source, lead.campaign, lead.locale,
              lead.attributes, lead.revision, lead.pii_ciphertext,
              lead.pii_iv, lead.pii_tag, lead.pii_key_version
         FROM crm_lead_delivery_outbox outbox
         JOIN crm_leads lead
           ON lead.tenant_id = outbox.tenant_id
          AND lead.id = outbox.lead_id
        WHERE outbox.id = $1::uuid
          AND outbox.tenant_id = $2
          AND outbox.lead_id = $3::uuid
          AND outbox.lead_revision = $4
          AND outbox.status = 'processing'
          AND outbox.locked_by = $5
          AND outbox.lease_expires_at > NOW()
          AND lead.status = 'active'
          AND lead.revision = outbox.lead_revision
        FOR UPDATE OF outbox
        FOR SHARE OF lead`,
      [claim.id, claim.tenant_id, claim.lead_id, claim.lead_revision, workerId],
    );
    const row = loaded.rows[0];
    if (!row) {
      const superseded = await client.query<{ id: string }>(
        `UPDATE crm_lead_delivery_outbox
            SET status = 'terminal',
                locked_at = NULL,
                locked_by = NULL,
                lease_expires_at = NULL,
                last_error_code = 'lease_lost_or_superseded',
                updated_at = NOW()
          WHERE id = $1::uuid
            AND status = 'processing'
            AND locked_by = $2
          RETURNING id`,
        [claim.id, workerId],
      );
      if (superseded.rows[0]) {
        await appendAudit(client, {
          tenantId: claim.tenant_id,
          leadId: claim.lead_id,
          action: "delivery_failed",
          actorType: "worker",
          actorId: workerId,
          metadata: {
            deliveryId: claim.id,
            revision: claim.lead_revision,
            terminal: true,
            errorCode: "lease_lost_or_superseded",
          },
        });
      }
      return { delivered: false };
    }

    const pii = decryptLeadPii(
      {
        ciphertext: row.pii_ciphertext,
        iv: row.pii_iv,
        tag: row.pii_tag,
        keyVersion: row.pii_key_version,
      },
      { tenantId: claim.tenant_id, leadId: claim.lead_id },
    );
    const body = JSON.stringify({
      leadId: claim.lead_id,
      tenantId: claim.tenant_id,
      kind: row.lead_kind,
      source: row.source,
      campaign: row.campaign,
      locale: row.locale,
      revision: row.revision,
      attributes: row.attributes,
      ...pii,
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", webhookSecret())
      .update(`${timestamp}.${body}`)
      .digest("hex");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": claim.id,
          "X-TecPey-Timestamp": timestamp,
          "X-TecPey-Signature": `v1=${signature}`,
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`crm_webhook_http_${response.status}`);
    } finally {
      clearTimeout(timer);
    }

    const updated = await client.query<{ lead_id: string }>(
      `UPDATE crm_lead_delivery_outbox
          SET status = 'delivered',
              delivered_at = NOW(),
              locked_at = NULL,
              locked_by = NULL,
              lease_expires_at = NULL,
              last_error_code = NULL,
              updated_at = NOW()
        WHERE id = $1::uuid
          AND status = 'processing'
          AND locked_by = $2
          AND lease_expires_at > NOW()
        RETURNING lead_id`,
      [claim.id, workerId],
    );
    if (!updated.rows[0]) throw new Error("crm_delivery_lease_lost");

    await appendAudit(client, {
      tenantId: claim.tenant_id,
      leadId: claim.lead_id,
      action: "delivery_succeeded",
      actorType: "worker",
      actorId: workerId,
      metadata: {
        deliveryId: claim.id,
        revision: claim.lead_revision,
      },
    });
    return { delivered: true };
  });

  if (!committed.enabled) throw new Error("crm_delivery_storage_unavailable");
}

export async function failCrmLeadClaim(
  claim: DeliveryClaim,
  workerId: string,
  errorCode: string,
): Promise<void> {
  const transaction = await withTx(async (client) => {
    const terminal = claim.attempt_count >= claim.max_attempts;
    const updated = await client.query<{ lead_id: string }>(
      `UPDATE crm_lead_delivery_outbox
          SET status = $3,
              available_at = CASE WHEN $3 = 'retryable'
                THEN NOW() + (LEAST(3600, 15 * power(2, GREATEST(0, attempt_count - 1)))::text || ' seconds')::interval
                ELSE available_at END,
              locked_at = NULL,
              locked_by = NULL,
              lease_expires_at = NULL,
              last_error_code = $4,
              updated_at = NOW()
        WHERE id = $1::uuid
          AND status = 'processing'
          AND locked_by = $2
        RETURNING lead_id`,
      [
        claim.id,
        workerId,
        terminal ? "terminal" : "retryable",
        errorCode.slice(0, 100),
      ],
    );
    if (!updated.rows[0]) return false;

    await appendAudit(client, {
      tenantId: claim.tenant_id,
      leadId: claim.lead_id,
      action: "delivery_failed",
      actorType: "worker",
      actorId: workerId,
      metadata: {
        deliveryId: claim.id,
        revision: claim.lead_revision,
        terminal,
        errorCode: errorCode.slice(0, 100),
      },
    });
    return true;
  });
  if (!transaction.enabled) throw new Error("crm_delivery_storage_unavailable");
}

export async function deleteExpiredCrmLeadPii(limit = 250): Promise<number> {
  const result = await withTx(async (client) => {
    const rows = await client.query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id
         FROM crm_leads
        WHERE status = 'active' AND retain_until <= NOW()
        ORDER BY retain_until
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [Math.max(1, Math.min(limit, 1000))],
    );
    for (const row of rows.rows) {
      await client.query(
        `UPDATE crm_lead_delivery_outbox
            SET status = 'terminal',
                locked_at = NULL,
                locked_by = NULL,
                lease_expires_at = NULL,
                last_error_code = 'retention_deleted',
                updated_at = NOW()
          WHERE lead_id = $1::uuid AND status <> 'delivered'`,
        [row.id],
      );
      await client.query(
        `UPDATE crm_leads
            SET status = 'deleted',
                deleted_at = NOW(),
                updated_at = NOW(),
                pii_ciphertext = '',
                pii_iv = '',
                pii_tag = '',
                attributes = '{}'::jsonb
          WHERE id = $1::uuid`,
        [row.id],
      );
      await appendAudit(client, {
        tenantId: row.tenant_id,
        leadId: row.id,
        action: "retention_deleted",
        actorType: "retention",
      });
    }
    return rows.rowCount ?? 0;
  });
  if (!result.enabled) throw new Error("crm_storage_unavailable");
  return result.value;
}
