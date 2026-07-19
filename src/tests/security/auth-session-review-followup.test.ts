import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";
import { Pool } from "pg";
import { refreshSessionCookie } from "../../lib/session-refresh";
import {
  extractJtiFromToken,
  setUnifiedSessionCookieAsync,
  UNIFIED_SESSION_COOKIE,
} from "../../lib/unified-session";

const databaseUrl = process.env.DATABASE_URL;

function withTemporaryEnv(
  values: Record<string, string | undefined>,
  callback: () => Promise<void> | void,
): Promise<void> {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test(
  "replacement access cookies are written only after durable JTI registration",
  { skip: !databaseUrl, timeout: 30_000 },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const accountId = `replacement-session:${crypto.randomUUID()}`;
    let jti: string | null = null;
    try {
      await withTemporaryEnv(
        {
          TECPEY_SESSION_SECRET:
            "replacement-session-secret-with-at-least-32-characters",
          TECPEY_SESSION_MAX_AGE_SECONDS: "3600",
          TECPEY_SESSION_MAX_AGE: undefined,
        },
        async () => {
          const response = NextResponse.json({ ok: true });
          await setUnifiedSessionCookieAsync(
            response,
            {
              accountId,
              studentId: null,
              email: "replacement@tecpey.invalid",
              displayName: "Replacement",
              username: `replacement-${crypto.randomUUID()}`,
            },
            { deviceInfo: "redteam-replacement-test", ip: "127.0.0.1" },
          );
          const token = response.cookies.get(UNIFIED_SESSION_COOKIE)?.value;
          assert.ok(token);
          jti = extractJtiFromToken(token);
          assert.ok(jti);

          const evidence = await pool.query<{
            user_id: string;
            device_info: string;
            ip: string;
            is_revoked: boolean;
            expires_at: Date;
          }>(
            `SELECT user_id, device_info, ip, is_revoked, expires_at
               FROM user_sessions
              WHERE id = $1`,
            [jti],
          );
          assert.equal(evidence.rows[0]?.user_id, accountId);
          assert.equal(evidence.rows[0]?.device_info, "redteam-replacement-test");
          assert.equal(evidence.rows[0]?.ip, "127.0.0.1");
          assert.equal(evidence.rows[0]?.is_revoked, false);
          assert.ok(
            (evidence.rows[0]?.expires_at.getTime() ?? 0) <=
              Date.now() + 3_700_000,
          );
        },
      );
    } finally {
      if (jti) await pool.query("DELETE FROM user_sessions WHERE id = $1", [jti]);
      await pool.end();
    }
  },
);

test("legacy sliding access-cookie refresh is disabled", async () => {
  await assert.rejects(
    () => refreshSessionCookie(),
    /refresh_token_rotation_required/,
  );
});

test("production validation rejects Redis-REST-only auth deployments", () => {
  const child = spawnSync(process.execPath, ["scripts/validate-env.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://tecpey.ir",
      NEXT_PUBLIC_API_URL: "https://my.tecpey.ir",
      NEXT_PUBLIC_API_BACKEND_URL: "https://api.tecpey.ir",
      NEXT_PUBLIC_API_SOCKET_URL: "wss://api.tecpey.ir/spot",
      TECPEY_SESSION_SECRET:
        "session-review-secret-with-at-least-32-characters",
      TECPEY_REFRESH_SECRET:
        "refresh-review-secret-with-at-least-32-characters",
      TECPEY_ACADEMY_AUTH_SECRET:
        "academy-review-secret-with-at-least-32-characters",
      CERTIFICATE_SIGNING_SECRET:
        "certificate-review-secret-with-at-least-32-characters",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test-upstash-token",
      REDIS_URL: "",
      TECPEY_LEGACY_AUTH_UNTIL: "",
    },
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /REDIS_URL is required in production/);
});
