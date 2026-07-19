import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { resolveWithdrawalReplay } from "../../lib/security/withdrawal-replay-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

describe("Committed withdrawal replay authority", () => {
  it("resolves exact replay from PostgreSQL without external providers", {
    skip: !integrationConfigured,
    timeout: 30_000,
  }, async () => {
    const userId = `withdraw-replay-provider-independent-${randomUUID()}`;
    const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
    const idempotencyKey = `withdrawal-replay-${randomUUID()}`;
    const requestHash = "a".repeat(64);

    const inserted = await withDb(async (client) => {
      await client.query(
        `INSERT INTO withdrawals (
           id, user_id, asset, amount, amount_usd, destination_address,
           network, state, security_gate_passed, two_fa_verified,
           idempotency_key, request_hash
         ) VALUES ($1,$2,'USDT','1',1,$3,'ethereum','compliance_review',TRUE,TRUE,$4,$5)`,
        [withdrawalId, userId, `0x${"a".repeat(40)}`, idempotencyKey, requestHash],
      );
      return true;
    });
    assert.equal(inserted.enabled, true);

    try {
      const exact = await resolveWithdrawalReplay({
        userId,
        idempotencyKey,
        requestHash,
      });
      assert.equal(exact.status, "replay");
      if (exact.status === "replay") {
        assert.equal(exact.withdrawal.id, withdrawalId);
        assert.equal(exact.withdrawal.userId, userId);
      }

      assert.deepEqual(
        await resolveWithdrawalReplay({
          userId,
          idempotencyKey,
          requestHash: "b".repeat(64),
        }),
        { status: "conflict" },
      );
      assert.deepEqual(
        await resolveWithdrawalReplay({
          userId,
          idempotencyKey: `missing-${randomUUID()}`,
          requestHash,
        }),
        { status: "none" },
      );
    } finally {
      await withDb(async (client) => {
        await client.query("DELETE FROM withdrawals WHERE id = $1 AND user_id = $2", [
          withdrawalId,
          userId,
        ]);
        return true;
      });
    }
  });

  it("checks committed replay before authorization preflight and external admission", async () => {
    const source = await readFile("src/app/api/auth/withdraw/route.ts", "utf8");
    const replayIndex = source.indexOf("resolveWithdrawalReplay({");
    const authorizationIdIndex = source.indexOf("const authorizationId");
    const authorizationPreflightIndex = source.indexOf(
      "inspectWithdrawalAuthorization({",
    );
    const admissionIndex = source.indexOf("createAuthoritativeWithdrawal({");
    assert.ok(replayIndex >= 0);
    assert.ok(authorizationIdIndex > replayIndex);
    assert.ok(authorizationPreflightIndex > authorizationIdIndex);
    assert.ok(admissionIndex > authorizationPreflightIndex);
  });
});
