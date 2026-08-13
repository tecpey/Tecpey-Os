import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { POST as refreshSession } from "../../app/api/auth/refresh/route";
import { withDb } from "../../lib/db";
import {
  issueRefreshToken,
  REFRESH_COOKIE,
  verifyRefreshToken,
} from "../../lib/security/refresh-tokens";
import { pinCsrfSiteOrigin } from "./csrf-origin-fixture";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

// verifyCsrfOrigin compares the request Origin against NEXT_PUBLIC_SITE_URL.
// Leaving that to the ambient environment made this assertion depend on the CI
// job's exported variables: without it the route answered 401 (user_not_found)
// long before the CSRF branch could reject anything, so the test proved
// nothing about CSRF.
pinCsrfSiteOrigin();

describe("Refresh route CSRF authority", () => {
  it(
    "rejects cross-origin refresh rotation without consuming the durable refresh token",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const userId = `refresh-csrf-${randomUUID()}`;
      const token = await issueRefreshToken({
        userId,
        familyId: randomUUID(),
        deviceInfo: "tecpey-refresh-csrf-test",
        ip: "127.0.0.1",
      });
      assert.ok(token);

      try {
        const request = new NextRequest("https://tecpey.ir/api/auth/refresh", {
          method: "POST",
          headers: {
            origin: "https://attacker.example",
            cookie: `${REFRESH_COOKIE}=${token}`,
            "user-agent": "tecpey-refresh-csrf-test",
          },
        });
        const response = await refreshSession(request);
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: "forbidden",
        });

        const stillValid = await verifyRefreshToken(token);
        assert.equal(stillValid.ok, true);
        if (stillValid.ok) assert.equal(stillValid.userId, userId);

        const evidence = await withDb(async (client) => {
          const result = await client.query<{ is_revoked: boolean }>(
            `SELECT is_revoked
               FROM refresh_tokens
              WHERE user_id = $1
              LIMIT 1`,
            [userId],
          );
          return result.rows[0]?.is_revoked ?? null;
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) assert.equal(evidence.value, false);
      } finally {
        const deleted = await withDb(async (client) => {
          await client.query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
          return true;
        });
        assert.equal(deleted.enabled, true);
      }
    },
  );
});
