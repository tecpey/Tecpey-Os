import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";
import {
  issueRefreshToken,
  verifyRefreshToken,
} from "../../lib/security/refresh-tokens";
import {
  revokeSessionAuthority,
  type SessionAuditContext,
} from "../../lib/security/session-authority";
import { registerSession } from "../../lib/security/session-store";
import { hashSensitiveAuditRequest } from "../../lib/security/sensitive-mutation-audit";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);
let pool: Pool | null = null;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function audit(userId: string): SessionAuditContext {
  const correlationId = `legacy-unbound-${randomUUID()}`;
  return {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    actorType: "user",
    actorId: userId,
    correlationId,
    requestHash: hashSensitiveAuditRequest({
      action: "session.revoke",
      userId,
      compatibilityPolicy: "legacy_unbound_revoke_all_refresh",
      correlationId,
    }),
  };
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Legacy unbound session compatibility authority", () => {
  it(
    "revokes every refresh token when an unbound legacy access session is revoked",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `legacy-unbound-${randomUUID()}`;
      const accessJti = randomUUID();
      const refreshTokens: string[] = [];

      try {
        assert.equal(
          await registerSession({
            jti: accessJti,
            userId,
            deviceInfo: "legacy-unbound-device",
            ip: "127.0.0.21",
            expiresAt: new Date(Date.now() + 15 * 60_000),
          }),
          true,
        );

        for (let index = 0; index < 2; index += 1) {
          const token = await issueRefreshToken({
            userId,
            familyId: randomUUID(),
            deviceInfo: `legacy-refresh-${index}`,
            ip: `127.0.0.${22 + index}`,
          });
          assert.ok(token);
          refreshTokens.push(token);
        }

        const result = await revokeSessionAuthority({
          userId,
          sessionJti: accessJti,
          audit: audit(userId),
        });
        assert.equal(result.ok, true);
        if (result.ok) assert.equal(result.revokedCount, 1);

        const state = await withClient(async (client) => {
          const session = await client.query<{ is_revoked: boolean }>(
            "SELECT is_revoked FROM user_sessions WHERE id = $1",
            [accessJti],
          );
          const refresh = await client.query<{ active: string }>(
            `SELECT COUNT(*) FILTER (WHERE is_revoked = FALSE)::text AS active
               FROM refresh_tokens
              WHERE user_id = $1`,
            [userId],
          );
          const outbox = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM session_revocation_outbox
              WHERE session_jti = $1`,
            [accessJti],
          );
          return {
            sessionRevoked: session.rows[0]?.is_revoked ?? false,
            activeRefresh: Number(refresh.rows[0]?.active ?? "0"),
            outboxCount: Number(outbox.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(state.sessionRevoked, true);
        assert.equal(state.activeRefresh, 0);
        assert.equal(state.outboxCount, 1);

        for (const token of refreshTokens) {
          assert.equal((await verifyRefreshToken(token)).ok, false);
        }
      } finally {
        await withClient(async (client) => {
          await client.query(
            "DELETE FROM session_revocation_outbox WHERE session_jti = $1",
            [accessJti],
          );
          await client.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);
          await client.query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
          await client.query("DELETE FROM refresh_token_families WHERE user_id = $1", [userId]);
          await client.query("DELETE FROM known_devices WHERE user_id = $1", [userId]);
        });
      }
    },
  );
});
