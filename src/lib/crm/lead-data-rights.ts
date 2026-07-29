import { withTx } from "@/lib/db";
import { decryptLeadPii } from "./lead-pii";

export async function exportCrmLeadData(input: {
  tenantId: string;
  leadId: string;
  actorId: string;
}) {
  const result = await withTx(async (client) => {
    const loaded = await client.query<{
      lead_kind: string;
      source: string;
      campaign: string | null;
      locale: string;
      attributes: Record<string, unknown>;
      privacy_notice_version: string;
      retention_class: string;
      revision: number;
      created_at: Date;
      updated_at: Date;
      pii_ciphertext: string;
      pii_iv: string;
      pii_tag: string;
      pii_key_version: number;
    }>(
      `SELECT lead_kind, source, campaign, locale, attributes,
              privacy_notice_version, retention_class, revision,
              created_at, updated_at, pii_ciphertext, pii_iv, pii_tag,
              pii_key_version
         FROM crm_leads
        WHERE tenant_id = $1 AND id = $2::uuid AND status = 'active'
        FOR SHARE`,
      [input.tenantId, input.leadId],
    );
    const row = loaded.rows[0];
    if (!row) return null;
    const pii = decryptLeadPii(
      {
        ciphertext: row.pii_ciphertext,
        iv: row.pii_iv,
        tag: row.pii_tag,
        keyVersion: row.pii_key_version,
      },
      { tenantId: input.tenantId, leadId: input.leadId },
    );
    await client.query(
      `INSERT INTO crm_lead_audit_events
        (tenant_id, lead_id, action, actor_type, actor_id, metadata)
       VALUES ($1, $2::uuid, 'exported', 'admin', $3, $4::jsonb)`,
      [input.tenantId, input.leadId, input.actorId, JSON.stringify({ revision: row.revision })],
    );
    return {
      id: input.leadId,
      kind: row.lead_kind,
      source: row.source,
      campaign: row.campaign,
      locale: row.locale,
      attributes: row.attributes,
      privacyNoticeVersion: row.privacy_notice_version,
      retentionClass: row.retention_class,
      revision: row.revision,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      pii,
    };
  });
  if (!result.enabled) throw new Error("crm_storage_unavailable");
  return result.value;
}

export async function deleteCrmLeadData(input: {
  tenantId: string;
  leadId: string;
  actorId: string;
}): Promise<boolean> {
  const result = await withTx(async (client) => {
    const deleted = await client.query<{ id: string }>(
      `UPDATE crm_leads
          SET status = 'deleted', deleted_at = NOW(), updated_at = NOW(),
              pii_ciphertext = '', pii_iv = '', pii_tag = '',
              attributes = '{}'::jsonb
        WHERE tenant_id = $1 AND id = $2::uuid AND status = 'active'
        RETURNING id`,
      [input.tenantId, input.leadId],
    );
    if (!deleted.rows[0]) return false;
    await client.query(
      `UPDATE crm_lead_delivery_outbox
          SET status = 'terminal', locked_at = NULL, locked_by = NULL,
              lease_expires_at = NULL, last_error_code = 'data_subject_deleted',
              updated_at = NOW()
        WHERE lead_id = $1::uuid AND status <> 'delivered'`,
      [input.leadId],
    );
    await client.query(
      `INSERT INTO crm_lead_audit_events
        (tenant_id, lead_id, action, actor_type, actor_id, metadata)
       VALUES ($1, $2::uuid, 'deleted', 'admin', $3, '{}'::jsonb)`,
      [input.tenantId, input.leadId, input.actorId],
    );
    return true;
  });
  if (!result.enabled) throw new Error("crm_storage_unavailable");
  return result.value;
}
