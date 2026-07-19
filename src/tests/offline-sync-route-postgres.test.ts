import assert from "node:assert/strict";
import test from "node:test";
import { Redis } from "ioredis";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { POST } from "../app/api/offline-sync/route";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import { registerSession } from "../lib/security/session-store";
import {
  extractJtiFromToken,
  signUnifiedSession,
  UNIFIED_SESSION_COOKIE,
} from "../lib/unified-session";

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;

function requestFor(token: string, body: unknown, origin = "https://tecpey.ir") {
  return new NextRequest("https://tecpey.ir/api/offline-sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${UNIFIED_SESSION_COOKIE}=${token}`,
      origin,
      "user-agent": "offline-sync-redteam-test",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

test(
  "offline sync route enforces CSRF and exact replay on a strict registered session",
  { skip: !databaseUrl || !redisUrl, timeout: 30_000 },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    const redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
    const previousRedis = globalThis.tecpeyRedisClient;
    const studentId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    let jti: string | null = null;

    try {
      await redis.connect();
      await redis.ping();
      globalThis.tecpeyRedisClient = redis;
      await applyDatabaseMigrationsWithLock(client);
      await client.query(
        `INSERT INTO academy_students (id, locale, email, display_name)
         VALUES ($1::uuid, 'fa', $2, 'Offline Route Red Team')`,
        [studentId, `${studentId}@offline-route.test`],
      );

      const token = await signUnifiedSession({
        accountId: null,
        studentId,
        email: `${studentId}@offline-route.test`,
        displayName: "Offline Route Red Team",
        username: `offline-${studentId.slice(0, 8)}`,
      });
      jti = extractJtiFromToken(token);
      assert.ok(jti);
      assert.equal(
        await registerSession({
          jti,
          userId: studentId,
          deviceInfo: "offline-sync-redteam-test",
          ip: "127.0.0.1",
          expiresAt: new Date(Date.now() + 60 * 60_000),
        }),
        true,
      );

      const item = {
        id: eventId,
        eventType: "lesson_viewed",
        source: "pwa",
        locale: "fa",
        clientCreatedAt: new Date().toISOString(),
        payload: { lessonId: "term-1-lesson-1", progress: 0.25 },
      };

      const csrf = await POST(requestFor(token, { items: [item] }, "https://evil.invalid"));
      assert.equal(csrf.status, 403);

      const first = await POST(requestFor(token, { items: [item] }));
      assert.equal(first.status, 200);
      const firstBody = (await first.json()) as {
        accepted: number;
        rejected: number;
        results: Array<{ id: string; replayed?: boolean; learningEventId?: string }>;
      };
      assert.equal(firstBody.accepted, 1);
      assert.equal(firstBody.rejected, 0);
      assert.equal(firstBody.results[0]?.id, eventId);
      assert.equal(firstBody.results[0]?.replayed, false);
      assert.ok(firstBody.results[0]?.learningEventId);

      const replay = await POST(requestFor(token, { items: [item] }));
      assert.equal(replay.status, 200);
      const replayBody = (await replay.json()) as {
        accepted: number;
        results: Array<{ replayed?: boolean }>;
      };
      assert.equal(replayBody.accepted, 1);
      assert.equal(replayBody.results[0]?.replayed, true);

      const conflict = await POST(
        requestFor(token, {
          items: [{ ...item, payload: { lessonId: "term-1-lesson-1", progress: 0.9 } }],
        }),
      );
      assert.equal(conflict.status, 200);
      const conflictBody = (await conflict.json()) as {
        accepted: number;
        rejected: number;
        results: Array<{ status: string; reason?: string }>;
      };
      assert.equal(conflictBody.accepted, 0);
      assert.equal(conflictBody.rejected, 1);
      assert.equal(conflictBody.results[0]?.status, "rejected");
      assert.equal(conflictBody.results[0]?.reason, "idempotency_conflict");

      const counts = await client.query<{ commands: string; events: string }>(
        `SELECT
           (SELECT COUNT(*)::text FROM offline_sync_commands
             WHERE student_id = $1::uuid AND client_event_id = $2) AS commands,
           (SELECT COUNT(*)::text FROM learning_events
             WHERE student_id = $1::uuid AND payload->>'offlineEventId' = $2) AS events`,
        [studentId, eventId],
      );
      assert.equal(counts.rows[0]?.commands, "1");
      assert.equal(counts.rows[0]?.events, "1");
    } finally {
      globalThis.tecpeyRedisClient = previousRedis;
      if (jti) {
        await redis.del(`tecpey:revoked:jti:${jti}`).catch(() => undefined);
        await client.query("DELETE FROM user_sessions WHERE id = $1", [jti]).catch(() => undefined);
      }
      await client.query(
        "DELETE FROM offline_sync_commands WHERE student_id = $1::uuid",
        [studentId],
      ).catch(() => undefined);
      await client.query(
        "DELETE FROM learning_events WHERE student_id = $1::uuid",
        [studentId],
      ).catch(() => undefined);
      await client.query(
        "DELETE FROM learning_brain WHERE student_id = $1::uuid",
        [studentId],
      ).catch(() => undefined);
      await client.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]).catch(() => undefined);
      client.release();
      await redis.quit().catch(() => undefined);
      await pool.end();
    }
  },
);
