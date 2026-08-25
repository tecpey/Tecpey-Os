import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withDb, withTx } from "@/lib/db";
import {
  decryptPhone,
  encryptPhone,
  phoneFingerprint,
} from "@/lib/security/phone-identity";

export type PhoneOtpPurpose = "signup" | "login" | "profile_verify";

type ChallengeRow = {
  id: string;
  phone_fingerprint: string;
  encrypted_phone: string;
  purpose: PhoneOtpPurpose;
  status: "prepared" | "sent" | "verifying" | "verified" | "consumed" | "failed" | "expired";
  attempt_count: number;
  max_attempts: number;
  expires_at: Date;
};

async function appendEvent(
  client: PoolClient,
  input: {
    challengeId: string;
    eventType: "prepared" | "sent" | "send_failed" | "verification_started" | "verification_failed" | "verified" | "consumed" | "expired";
    phoneFingerprint: string;
    metadata?: Record<string, string | number | boolean>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO identity_phone_otp_events
       (challenge_id, event_type, phone_fingerprint, metadata)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      input.challengeId,
      input.eventType,
      input.phoneFingerprint,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function preparePhoneOtpChallenge(input: {
  phoneE164: string;
  purpose: PhoneOtpPurpose;
  ttlSeconds?: number;
}): Promise<{ status: "prepared"; challengeId: string; expiresAt: Date } | { status: "unavailable" }> {
  const challengeId = randomUUID();
  const fingerprint = phoneFingerprint(input.phoneE164);
  const expiresAt = new Date(Date.now() + Math.min(Math.max(input.ttlSeconds ?? 300, 120), 600) * 1000);
  const encrypted = encryptPhone(input.phoneE164);
  const transaction = await withTx(async (client) => {
    await client.query(
      `UPDATE identity_phone_otp_challenges
          SET status = 'expired', verified_at = NULL, updated_at = NOW()
        WHERE phone_fingerprint = $1
          AND purpose = $2
          AND status IN ('prepared', 'sent', 'verifying', 'verified')`,
      [fingerprint, input.purpose],
    );
    await client.query(
      `INSERT INTO identity_phone_otp_challenges
         (id, phone_fingerprint, encrypted_phone, purpose, provider, expires_at)
       VALUES ($1, $2, $3, $4, 'limoo_sms', $5)`,
      [challengeId, fingerprint, encrypted, input.purpose, expiresAt],
    );
    await appendEvent(client, {
      challengeId,
      eventType: "prepared",
      phoneFingerprint: fingerprint,
      metadata: { provider: "limoo_sms", purpose: input.purpose },
    });
  });
  if (!transaction.enabled) return { status: "unavailable" };
  return { status: "prepared", challengeId, expiresAt };
}

export async function finalizePhoneOtpSend(input: {
  challengeId: string;
  sent: boolean;
  failureReason?: string;
}): Promise<boolean> {
  const transaction = await withTx(async (client) => {
    const selected = await client.query<ChallengeRow>(
      `SELECT id, phone_fingerprint, encrypted_phone, purpose, status,
              attempt_count, max_attempts, expires_at
         FROM identity_phone_otp_challenges
        WHERE id = $1
        FOR UPDATE`,
      [input.challengeId],
    );
    const row = selected.rows[0];
    if (!row || row.status !== "prepared") return false;
    await client.query(
      `UPDATE identity_phone_otp_challenges
          SET status = $2, updated_at = NOW()
        WHERE id = $1`,
      [row.id, input.sent ? "sent" : "failed"],
    );
    await appendEvent(client, {
      challengeId: row.id,
      eventType: input.sent ? "sent" : "send_failed",
      phoneFingerprint: row.phone_fingerprint,
      metadata: input.sent
        ? { provider: "limoo_sms" }
        : { provider: "limoo_sms", reason: input.failureReason?.slice(0, 80) || "provider_failure" },
    });
    return true;
  });
  return transaction.enabled ? transaction.value : false;
}

export async function claimPhoneOtpVerification(challengeId: string): Promise<
  | { status: "claimed"; phoneE164: string; phoneFingerprint: string; purpose: PhoneOtpPurpose }
  | { status: "not_found" | "invalid_state" | "expired" | "attempts_exhausted" | "unavailable" }
> {
  const transaction = await withTx(async (client) => {
    const selected = await client.query<ChallengeRow>(
      `SELECT id, phone_fingerprint, encrypted_phone, purpose, status,
              attempt_count, max_attempts, expires_at
         FROM identity_phone_otp_challenges
        WHERE id = $1
        FOR UPDATE`,
      [challengeId],
    );
    const row = selected.rows[0];
    if (!row) return { status: "not_found" } as const;
    if (row.expires_at.getTime() <= Date.now()) {
      if (["prepared", "sent", "verifying", "verified"].includes(row.status)) {
        await client.query(
          "UPDATE identity_phone_otp_challenges SET status = 'expired', verified_at = NULL, updated_at = NOW() WHERE id = $1",
          [row.id],
        );
        await appendEvent(client, {
          challengeId: row.id,
          eventType: "expired",
          phoneFingerprint: row.phone_fingerprint,
        });
      }
      return { status: "expired" } as const;
    }
    if (row.attempt_count >= row.max_attempts) return { status: "attempts_exhausted" } as const;
    if (row.status !== "sent") return { status: "invalid_state" } as const;

    await client.query(
      `UPDATE identity_phone_otp_challenges
          SET status = 'verifying', attempt_count = attempt_count + 1, updated_at = NOW()
        WHERE id = $1`,
      [row.id],
    );
    await appendEvent(client, {
      challengeId: row.id,
      eventType: "verification_started",
      phoneFingerprint: row.phone_fingerprint,
      metadata: { attempt: row.attempt_count + 1 },
    });
    return {
      status: "claimed",
      phoneE164: decryptPhone(row.encrypted_phone),
      phoneFingerprint: row.phone_fingerprint,
      purpose: row.purpose,
    } as const;
  });
  return transaction.enabled ? transaction.value : { status: "unavailable" };
}

export async function completePhoneOtpVerification(input: {
  challengeId: string;
  verified: boolean;
  retryableProviderFailure?: boolean;
  failureReason?: string;
}): Promise<"verified" | "rejected" | "unavailable"> {
  const transaction = await withTx(async (client) => {
    const selected = await client.query<ChallengeRow>(
      `SELECT id, phone_fingerprint, encrypted_phone, purpose, status,
              attempt_count, max_attempts, expires_at
         FROM identity_phone_otp_challenges
        WHERE id = $1
        FOR UPDATE`,
      [input.challengeId],
    );
    const row = selected.rows[0];
    if (!row || row.status !== "verifying") return "rejected" as const;
    if (input.verified) {
      await client.query(
        `UPDATE identity_phone_otp_challenges
            SET status = 'verified', verified_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [row.id],
      );
      await appendEvent(client, {
        challengeId: row.id,
        eventType: "verified",
        phoneFingerprint: row.phone_fingerprint,
        metadata: { provider: "limoo_sms" },
      });
      return "verified" as const;
    }
    const exhausted = row.attempt_count >= row.max_attempts;
    const nextStatus = input.retryableProviderFailure ? "sent" : exhausted ? "failed" : "sent";
    await client.query(
      `UPDATE identity_phone_otp_challenges
          SET status = $2, updated_at = NOW()
        WHERE id = $1`,
      [row.id, nextStatus],
    );
    await appendEvent(client, {
      challengeId: row.id,
      eventType: "verification_failed",
      phoneFingerprint: row.phone_fingerprint,
      metadata: {
        provider: "limoo_sms",
        reason: input.failureReason?.slice(0, 80) || "invalid_code",
        retryable: Boolean(input.retryableProviderFailure),
      },
    });
    return "rejected" as const;
  });
  return transaction.enabled ? transaction.value : "unavailable";
}

export async function loadVerifiedPhoneChallenge(input: {
  challengeId: string;
  phoneE164: string;
  purpose: PhoneOtpPurpose;
}): Promise<{ status: "verified" } | { status: "invalid" | "unavailable" }> {
  const fingerprint = phoneFingerprint(input.phoneE164);
  const result = await withDb(async (client) => {
    const selected = await client.query<{ valid: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM identity_phone_otp_challenges
          WHERE id = $1
            AND phone_fingerprint = $2
            AND purpose = $3
            AND status = 'verified'
            AND verified_at IS NOT NULL
            AND expires_at > NOW()
       ) AS valid`,
      [input.challengeId, fingerprint, input.purpose],
    );
    return selected.rows[0]?.valid === true;
  });
  if (!result.enabled) return { status: "unavailable" };
  return result.value ? { status: "verified" } : { status: "invalid" };
}

export async function consumeVerifiedPhoneChallengeTx(
  client: PoolClient,
  input: {
    challengeId: string;
    phoneE164: string;
    purpose: PhoneOtpPurpose;
    accountId: string;
  },
): Promise<boolean> {
  const fingerprint = phoneFingerprint(input.phoneE164);
  const updated = await client.query<{ phone_fingerprint: string }>(
    `UPDATE identity_phone_otp_challenges
        SET status = 'consumed', consumed_at = NOW(), consumed_by_account_id = $4,
            updated_at = NOW()
      WHERE id = $1
        AND phone_fingerprint = $2
        AND purpose = $3
        AND status = 'verified'
        AND verified_at IS NOT NULL
        AND expires_at > NOW()
      RETURNING phone_fingerprint`,
    [input.challengeId, fingerprint, input.purpose, input.accountId],
  );
  if (!updated.rows[0]) return false;
  await appendEvent(client, {
    challengeId: input.challengeId,
    eventType: "consumed",
    phoneFingerprint: updated.rows[0].phone_fingerprint,
    metadata: { purpose: input.purpose },
  });
  return true;
}

export async function lockVerifiedPhoneChallengeTx(
  client: PoolClient,
  input: {
    challengeId: string;
    phoneE164: string;
    purpose: PhoneOtpPurpose;
  },
): Promise<boolean> {
  const fingerprint = phoneFingerprint(input.phoneE164);
  const selected = await client.query<{ id: string }>(
    `SELECT id
       FROM identity_phone_otp_challenges
      WHERE id = $1
        AND phone_fingerprint = $2
        AND purpose = $3
        AND status = 'verified'
        AND verified_at IS NOT NULL
        AND expires_at > NOW()
      FOR UPDATE`,
    [input.challengeId, fingerprint, input.purpose],
  );
  return Boolean(selected.rows[0]);
}
