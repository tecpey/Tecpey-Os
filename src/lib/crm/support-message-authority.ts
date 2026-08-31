import { createHash, randomUUID } from "node:crypto";
import { withDb, withTx } from "../db";
import {
  decryptLeadPii,
  encryptLeadPii,
  hashLeadValue,
  normalizeLeadEmail,
  normalizeLeadPhone,
} from "./lead-pii";
import type { SupportMessageCommand } from "./support-message-input";

/**
 * How long a support message is kept before the retention sweep clears its PII.
 *
 * Shorter than a lead's twelve months: a lead is a standing relationship, a
 * support message is a conversation that ends. Six months is long enough to
 * answer, follow up and audit a complaint, and no longer.
 */
export const SUPPORT_MESSAGE_RETENTION_MONTHS = 6;

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

/**
 * What the idempotency key is a key *to*.
 *
 * Without this, a key reused with different content would resolve to the older
 * row and be reported as sent — so a sender who lost the response, edited their
 * message and retried would watch the edit disappear. That is the defect this
 * whole change exists to remove, so the key is bound to the payload it was
 * issued for.
 */
export function hashSupportMessageCommand(command: SupportMessageCommand): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        locale: command.locale,
        source: command.source,
        name: command.name,
        email: normalizeLeadEmail(command.email),
        phone: command.phone ? normalizeLeadPhone(command.phone) : "",
        subject: command.subject,
        message: command.message,
        consent: command.consent,
        legalBasis: command.legalBasis,
        privacyNoticeVersion: command.privacyNoticeVersion,
      }),
    )
    .digest("hex");
}

export type SupportMessageResult = {
  id: string;
  created: boolean;
};

/**
 * Store one support message.
 *
 * Append-only by design. The only thing deduplicated is the *submission* — a
 * double click or a retried request carrying the same idempotency key resolves
 * to the row already written, rather than a second copy. Two genuinely
 * different messages from the same person are two rows, because the defect this
 * closes is a message that disappears.
 */
export async function ingestSupportMessage(
  command: SupportMessageCommand,
): Promise<
  | { status: "committed"; result: SupportMessageResult }
  | { status: "conflict" }
  | { status: "unavailable" }
> {
  const requestHash = hashSupportMessageCommand(command);
  const phone = command.phone ? normalizeLeadPhone(command.phone) : "";
  const email = normalizeLeadEmail(command.email);
  // Whichever detail the sender gave is what identifies them. Hashing the empty
  // one too would make every email-only sender share a phone_hash.
  const contactHash = hashLeadValue(email ? `email:${email}` : `phone:${phone}`);
  const emailHash = email ? hashLeadValue(email) : null;
  const phoneHash = phone ? hashLeadValue(phone) : null;

  try {
    const transaction = await withTx(async (client) => {
      // Serialise concurrent submissions of the same key so two requests cannot
      // both miss the row and both insert.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `support-message:${command.tenantId}:${command.idempotencyKey}`,
      ]);

      const existing = await client.query<{ id: string; request_hash: string }>(
        `SELECT id, request_hash
           FROM support_messages
          WHERE tenant_id = $1 AND idempotency_key = $2
          FOR SHARE`,
        [command.tenantId, command.idempotencyKey],
      );
      if (existing.rows[0]) {
        // Same key, different message: the caller edited something and reused
        // the key. Returning the stored row would report the edit as sent.
        if (existing.rows[0].request_hash !== requestHash) {
          return { status: "conflict" as const };
        }
        return {
          status: "committed" as const,
          result: { id: existing.rows[0].id, created: false },
        };
      }

      const id = randomUUID();
      // The subject and body travel inside the same encrypted envelope as the
      // sender's details: the message itself is as personal as the name on it.
      const encrypted = encryptLeadPii(
        {
          name: command.name,
          phone,
          email: email || undefined,
          note: `${command.subject}\n\n${command.message}`,
        },
        { tenantId: command.tenantId, leadId: id },
      );

      await client.query(
        `INSERT INTO support_messages
           (id, tenant_id, idempotency_key, request_hash, locale, source,
            pii_ciphertext, pii_iv, pii_tag, pii_key_version,
            contact_hash, email_hash, phone_hash, network_fingerprint,
            consent, legal_basis, privacy_notice_version, retain_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE, $15, $16,
                 NOW() + ($17 || ' months')::interval)`,
        [
          id,
          command.tenantId,
          command.idempotencyKey,
          requestHash,
          command.locale,
          command.source,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.tag,
          encrypted.keyVersion,
          contactHash,
          emailHash,
          phoneHash,
          command.networkFingerprint,
          command.legalBasis,
          command.privacyNoticeVersion,
          String(SUPPORT_MESSAGE_RETENTION_MONTHS),
        ],
      );

      return { status: "committed" as const, result: { id, created: true } };
    });
    // A pool that is not configured is indistinguishable, to the sender, from a
    // message that was not stored — so it is the same answer.
    return transaction.enabled ? transaction.value : { status: "unavailable" as const };
  } catch {
    // The caller turns this into a 503. Storage being down must not read to the
    // sender as "message sent".
    return { status: "unavailable" };
  }
}

/**
 * Clear the PII of support messages past their retention date.
 *
 * Mirrors deleteExpiredCrmLeadPii: the row survives as an auditable record that
 * a message existed and was answered; what it carried does not.
 *
 * Returns a status rather than a bare count. `withTx` reports `enabled: false`
 * both for an unconfigured pool and for a failed schema check, so a plain `0`
 * would say "nothing was due for erasure" when the truth is "the sweep never
 * ran" — the six-month promise in the consent text would look enforced while
 * nothing enforced it. That is the SB-013 defect wearing an operations hat.
 */
export async function deleteExpiredSupportMessagePii(
  limit = 250,
): Promise<{ status: "swept"; deleted: number } | { status: "unavailable" }> {
  const transaction = await withTx(async (client) => {
    const rows = await client.query<{ id: string }>(
      `SELECT id
         FROM support_messages
        WHERE status = 'active' AND retain_until <= NOW()
        ORDER BY retain_until
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [Math.max(1, Math.min(limit, 1000))],
    );
    for (const row of rows.rows) {
      await client.query(
        `UPDATE support_messages
            SET status = 'deleted',
                deleted_at = NOW(),
                updated_at = NOW(),
                pii_ciphertext = '',
                pii_iv = '',
                pii_tag = ''
          WHERE id = $1::uuid`,
        [row.id],
      );
    }
    return rows.rows.length;
  });
  return transaction.enabled
    ? { status: "swept", deleted: transaction.value }
    : { status: "unavailable" };
}

export type SupportInboxMessage = {
  id: string;
  createdAt: string;
  retainUntil: string;
  locale: string;
  source: string;
  name: string;
  contact: string;
  subject: string;
  message: string;
};

/**
 * Read the support queue for one tenant.
 *
 * The counterpart to storing the message. Without a reader, the form's promise
 * that support will respond would be as untrue as the mailto it replaced — the
 * row would exist and nobody could answer it.
 *
 * Redacted by default. Listing the queue to see whether anything is waiting
 * should not decrypt everyone's personal details into a terminal or a log;
 * `reveal` is the deliberate act of reading someone's message.
 *
 * Returns a status rather than a bare array for the same reason the sweep does:
 * an empty list would tell an operator "nobody is waiting" when the database was
 * merely unreachable, and the one thing this feature must never do is report a
 * message that is not there — in either direction.
 */
const SUPPORT_INBOX_CURSOR_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readSupportMessageInbox(options: {
  tenantId: string;
  limit?: number;
  reveal?: boolean;
  cursor?: string;
}): Promise<
  | {
      status: "ok";
      messages: SupportInboxMessage[];
      nextCursor: string | null;
    }
  | { status: "invalid_cursor" }
  | { status: "unavailable" }
> {
  const limit = Math.max(1, Math.min(200, options.limit ?? 20));
  const cursor = options.cursor?.trim() || null;
  if (cursor && !SUPPORT_INBOX_CURSOR_PATTERN.test(cursor)) {
    return { status: "invalid_cursor" };
  }

  const transaction = await withDb(async (client) => {
    let cursorPosition: { created_at: Date; id: string } | null = null;
    if (cursor) {
      const cursorResult = await client.query<{ created_at: Date; id: string }>(
        `SELECT created_at, id
           FROM support_messages
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [options.tenantId, cursor],
      );
      cursorPosition = cursorResult.rows[0] ?? null;
      if (!cursorPosition) return { status: "invalid_cursor" as const };
    }

    const result = await client.query<{
      id: string;
      created_at: Date;
      retain_until: Date;
      locale: string;
      source: string;
      pii_ciphertext: string;
      pii_iv: string;
      pii_tag: string;
      pii_key_version: number;
    }>(
      `SELECT id, created_at, retain_until, locale, source,
              pii_ciphertext, pii_iv, pii_tag, pii_key_version
         FROM support_messages
        WHERE tenant_id = $1
          AND status = 'active'
          AND (
            $2::timestamptz IS NULL
            OR (created_at, id) < ($2::timestamptz, $3::uuid)
          )
        ORDER BY created_at DESC, id DESC
        LIMIT $4`,
      [
        options.tenantId,
        cursorPosition?.created_at ?? null,
        cursorPosition?.id ?? null,
        limit + 1,
      ],
    );
    return { status: "ok" as const, rows: result.rows };
  });
  if (!transaction.enabled) return { status: "unavailable" };
  if (transaction.value.status === "invalid_cursor") {
    return { status: "invalid_cursor" };
  }

  const hasMore = transaction.value.rows.length > limit;
  const pageRows = transaction.value.rows.slice(0, limit);
  const nextCursor =
    hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].id : null;

  const messages = pageRows.map((row) => {
    const base = {
      id: row.id,
      createdAt: row.created_at.toISOString(),
      retainUntil: row.retain_until.toISOString(),
      locale: row.locale,
      source: row.source,
    };
    if (!options.reveal) {
      return {
        ...base,
        name: "[redacted]",
        contact: "[redacted]",
        subject: "[redacted]",
        message: "[redacted]",
      };
    }
    // Decryption is scoped to the row: the envelope's authenticated data binds
    // tenant and id, so a ciphertext copied from another tenant will not open.
    const pii = decryptLeadPii(
      {
        ciphertext: row.pii_ciphertext,
        iv: row.pii_iv,
        tag: row.pii_tag,
        keyVersion: row.pii_key_version,
      },
      { tenantId: options.tenantId, leadId: row.id },
    );
    const [subject, ...body] = (pii.note ?? "").split("\n\n");
    return {
      ...base,
      name: pii.name,
      contact: pii.email || pii.phone || "",
      subject: subject ?? "",
      message: body.join("\n\n"),
    };
  });
  return { status: "ok", messages, nextCursor };
}
