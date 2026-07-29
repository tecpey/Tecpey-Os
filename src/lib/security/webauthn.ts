// Shared WebAuthn utilities that do not own credential state.
//
// All user credential registration, assertion verification, counter advancement,
// rename and revoke authority lives exclusively in
// `webauthn-credential-authority.ts`. Keeping this module mutation-free prevents
// a second credential authority from reappearing beside the transactional path.

import { createHash, randomBytes } from "node:crypto";
import { withDb } from "@/lib/db";

export function generateChallenge(): string {
  return randomBytes(32).toString("base64url");
}

export function deviceFingerprint(userAgent: string, ip: string): string {
  return createHash("sha256")
    .update(`${userAgent}\0${ip}`)
    .digest("hex");
}

export async function markDeviceSeen(
  userId: string,
  fingerprint: string,
): Promise<{ isNew: boolean }> {
  const result = await withDb(async (client) => {
    const existing = await client.query(
      `SELECT id
         FROM known_devices
        WHERE user_id = $1
          AND fingerprint = $2`,
      [userId, fingerprint],
    );
    if ((existing.rowCount ?? 0) > 0) {
      await client.query(
        `UPDATE known_devices
            SET last_seen_at = NOW()
          WHERE user_id = $1
            AND fingerprint = $2`,
        [userId, fingerprint],
      );
      return { isNew: false };
    }

    await client.query(
      `INSERT INTO known_devices (user_id, fingerprint)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, fingerprint],
    );
    return { isNew: true };
  });

  // Known-device/session evidence is intentionally owned by the next bounded
  // #161 session/device slice. Credential authority never depends on this
  // compatibility projection succeeding.
  return result.enabled ? result.value : { isNew: false };
}
