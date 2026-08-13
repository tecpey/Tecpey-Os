import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { Pool, type PoolClient } from "pg";

import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { DEGRADED_READ_COUNTER } from "../../lib/degraded-read";
import { metrics } from "../../lib/metrics";
import { UNIFIED_SESSION_COOKIE } from "../../lib/unified-session";

// GET /api/academy-certificates answers 200 with an empty list in more than one
// situation, and it has to tell them apart honestly.
//
// An unreachable revocation authority makes strict verification fail closed to a
// guest, so "no certificates" would be a claim the server cannot support — the
// silent degradation of audit finding F-2. But an account-only session is not
// that: academy-auth signs one on every login before the student profile exists
// (studentId: null), and such a user really does have no certificates yet.
//
// The route first distinguished them by cookie presence, which cannot: an
// account-only cookie, an expired one and an outage all present a cookie. That
// showed "temporarily unavailable" to ordinary logged-in users and emitted a
// false outage metric. This case needs a reachable authority to exist at all,
// so it is Postgres-backed rather than run against a deleted DATABASE_URL.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
const SESSION_SECRET = "tecpey-certificate-session-test-secret-32";
let pool: Pool | null = null;
const sessionIds = new Set<string>();

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

/** A unified session that is registered and active, exactly as login leaves it. */
async function admittedCookie(claims: {
  accountId: string | null;
  studentId: string | null;
}): Promise<string> {
  const jti = randomUUID();
  const userId = claims.accountId ?? claims.studentId ?? randomUUID();
  sessionIds.add(jti);
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO user_sessions (id, user_id, expires_at, is_revoked)
       VALUES ($1, $2, now() + interval '1 hour', false)`,
      [jti, userId],
    );
  });
  const token = await new SignJWT({
    role: "unified",
    v: 1,
    accountId: claims.accountId,
    studentId: claims.studentId,
    email: "account-only@tecpey.test",
    displayName: null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(SESSION_SECRET));
  return `${UNIFIED_SESSION_COOKIE}=${token}`;
}

function counterFor(route: string): number {
  return metrics.getSnapshot().counters[`${DEGRADED_READ_COUNTER}:${route}`] ?? 0;
}

// A reachable deny store holding no deny record — the second half of what a
// strict check needs before it can call a session active. Without a client at
// all the strict check has no fast authority to consult, which is itself an
// unavailable authority, so these cases could not otherwise exist.
class ReachableEmptyRedis {
  async get(): Promise<string | null> {
    return null;
  }
}

const originalRedis = Reflect.get(globalThis, "tecpeyRedisClient");

before(async () => {
  if (!configured || !databaseUrl) return;
  process.env.TECPEY_SESSION_SECRET = SESSION_SECRET;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
  Reflect.set(globalThis, "tecpeyRedisClient", new ReachableEmptyRedis());
  metrics.reset();
});

after(async () => {
  if (pool) {
    await withClient(async (client) => {
      for (const id of sessionIds) {
        await client.query("DELETE FROM user_sessions WHERE id = $1", [id]);
      }
    });
  }
  await pool?.end();
  pool = null;
  Reflect.set(globalThis, "tecpeyRedisClient", originalRedis ?? null);
  metrics.reset();
});

describe("Certificate read session degradation", () => {
  it(
    "reports no certificates, not an outage, for a valid account-only session",
    { skip: !configured, timeout: 45_000 },
    async () => {
      const cookie = await admittedCookie({ accountId: randomUUID(), studentId: null });
      const { GET } = await import("../../app/api/academy-certificates/route");
      const before = counterFor("/api/academy-certificates");

      const response = await GET(
        new NextRequest("https://tecpey.ir/api/academy-certificates", {
          headers: { cookie },
        }),
      );

      assert.equal(response.status, 200);
      const body = (await response.json()) as Record<string, unknown>;
      assert.equal(
        body.degraded,
        false,
        "a normal pre-profile login is not an outage",
      );
      assert.deepEqual(body.certificates, []);
      assert.equal(
        counterFor("/api/academy-certificates"),
        before,
        "no outage metric may be emitted for an ordinary logged-in user",
      );
    },
  );

  it(
    "reports no certificates, not an outage, for a session with no cookie at all",
    { skip: !configured, timeout: 45_000 },
    async () => {
      const { GET } = await import("../../app/api/academy-certificates/route");
      const before = counterFor("/api/academy-certificates");

      const response = await GET(
        new NextRequest("https://tecpey.ir/api/academy-certificates"),
      );

      const body = (await response.json()) as Record<string, unknown>;
      assert.equal(body.degraded, false);
      assert.equal(counterFor("/api/academy-certificates"), before);
    },
  );

  it(
    "reports no certificates, not an outage, for a revoked session",
    { skip: !configured, timeout: 45_000 },
    async () => {
      // A revoked credential is a decision an authority made, so the empty
      // answer is true. Only an authority that could not be reached at all is
      // degradation.
      const cookie = await admittedCookie({
        accountId: randomUUID(),
        studentId: randomUUID(),
      });
      const jti = [...sessionIds].at(-1)!;
      await withClient(async (client) => {
        await client.query(
          "UPDATE user_sessions SET is_revoked = true, revoked_at = now() WHERE id = $1",
          [jti],
        );
      });

      const { GET } = await import("../../app/api/academy-certificates/route");
      const before = counterFor("/api/academy-certificates");
      const response = await GET(
        new NextRequest("https://tecpey.ir/api/academy-certificates", {
          headers: { cookie },
        }),
      );

      const body = (await response.json()) as Record<string, unknown>;
      assert.equal(body.degraded, false);
      assert.equal(counterFor("/api/academy-certificates"), before);
    },
  );
});
