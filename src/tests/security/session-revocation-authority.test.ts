import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  isJtiRevoked,
  isJtiRevokedStrict,
} from "../../lib/security/jti-store";
import { revokeSessionStrict } from "../../lib/security/session-store";

const databaseUrl = process.env.DATABASE_URL;

type FakeRedis = {
  values: Map<string, string>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string>;
  pipeline(): {
    set(key: string, value: string): void;
    exec(): Promise<Array<[null, string]>>;
  };
};

function createFakeRedis(): FakeRedis {
  const values = new Map<string, string>();
  const staged: Array<[string, string]> = [];
  return {
    values,
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
      return "OK";
    },
    pipeline() {
      staged.length = 0;
      return {
        set(key, value) {
          staged.push([key, value]);
        },
        async exec() {
          for (const [key, value] of staged) values.set(key, value);
          return staged.map(() => [null, "OK"]);
        },
      };
    },
  };
}

test(
  "session revocation binds the owner and strict checks require Redis plus durable evidence",
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    const jti = crypto.randomUUID();
    const ownerId = `auth-owner:${crypto.randomUUID()}`;
    const attackerId = `auth-attacker:${crypto.randomUUID()}`;
    const originalRedis = globalThis.tecpeyRedisClient;

    try {
      await applyDatabaseMigrationsWithLock(client);
      await client.query(
        `INSERT INTO user_sessions
          (id, user_id, device_info, ip, expires_at)
         VALUES ($1, $2, 'redteam-test', '127.0.0.1', NOW() + INTERVAL '1 hour')`,
        [jti, ownerId],
      );

      globalThis.tecpeyRedisClient = undefined;
      assert.equal(await isJtiRevoked(jti), false);
      assert.equal(await isJtiRevokedStrict(jti), true);

      const fakeRedis = createFakeRedis();
      globalThis.tecpeyRedisClient = fakeRedis as unknown as typeof originalRedis;
      assert.equal(await isJtiRevokedStrict(jti), false);

      assert.deepEqual(await revokeSessionStrict(jti, attackerId), {
        ok: false,
        reason: "session_not_found",
      });

      assert.deepEqual(await revokeSessionStrict(jti, ownerId), { ok: true });
      const durable = await client.query<{
        is_revoked: boolean;
        revoked_at: Date | null;
      }>(
        `SELECT is_revoked, revoked_at FROM user_sessions WHERE id = $1`,
        [jti],
      );
      assert.equal(durable.rows[0]?.is_revoked, true);
      assert.ok(durable.rows[0]?.revoked_at);
      assert.equal(await isJtiRevoked(jti), true);
      assert.equal(await isJtiRevokedStrict(jti), true);
    } finally {
      globalThis.tecpeyRedisClient = originalRedis;
      await client.query(`DELETE FROM user_sessions WHERE id = $1`, [jti]);
      client.release();
      await pool.end();
    }
  },
);

test(
  "missing durable session evidence is rejected even when Redis has no deny entry",
  { skip: !databaseUrl },
  async () => {
    const originalRedis = globalThis.tecpeyRedisClient;
    const fakeRedis = createFakeRedis();
    globalThis.tecpeyRedisClient = fakeRedis as unknown as typeof originalRedis;
    try {
      const unknownJti = crypto.randomUUID();
      assert.equal(await isJtiRevoked(unknownJti), true);
      assert.equal(await isJtiRevokedStrict(unknownJti), true);
    } finally {
      globalThis.tecpeyRedisClient = originalRedis;
    }
  },
);
