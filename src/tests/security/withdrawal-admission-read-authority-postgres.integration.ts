import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import {
  listPendingReviewWithdrawalsStrict,
  listUserWithdrawalsStrict,
  readWithdrawal,
} from "../../lib/security/withdrawal-read-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

const userA = `withdraw-read-a-${randomUUID()}`;
const userB = `withdraw-read-b-${randomUUID()}`;
const ids = {
  oldest: randomUUID().replaceAll("-", "").slice(0, 32),
  middle: randomUUID().replaceAll("-", "").slice(0, 32),
  newest: randomUUID().replaceAll("-", "").slice(0, 32),
  foreign: randomUUID().replaceAll("-", "").slice(0, 32),
};

async function insertWithdrawal(input: {
  id: string;
  userId: string;
  state: string;
  amount: string;
  amountUsd: string;
  createdAt: string;
}): Promise<void> {
  const inserted = await withDb(async (client) => {
    await client.query(
      `INSERT INTO withdrawals (
         id, user_id, asset, amount, amount_usd, destination_address,
         network, state, security_gate_passed, device_fingerprint,
         ip, user_agent, two_fa_verified, velocity_used, created_at, updated_at
       ) VALUES (
         $1, $2, 'USDT', $3::numeric, $4::numeric, $5,
         'ethereum', $6, TRUE, 'withdrawal-read-authority-test',
         '127.0.0.1', 'withdrawal-read-authority-test', TRUE, $4::numeric,
         $7::timestamptz, $7::timestamptz
       )`,
      [
        input.id,
        input.userId,
        input.amount,
        input.amountUsd,
        `0x${input.id.slice(0, 40).padEnd(40, "0")}`,
        input.state,
        input.createdAt,
      ],
    );
    return true;
  });
  assert.equal(inserted.enabled, true);
}

before(async () => {
  if (!integrationConfigured) return;
  await insertWithdrawal({
    id: ids.oldest,
    userId: userA,
    state: "pending",
    amount: "1.25",
    amountUsd: "1.25",
    createdAt: "2000-01-01T00:00:00.000Z",
  });
  await insertWithdrawal({
    id: ids.middle,
    userId: userA,
    state: "compliance_review",
    amount: "2.50",
    amountUsd: "2.50",
    createdAt: "2001-01-01T00:00:00.000Z",
  });
  await insertWithdrawal({
    id: ids.newest,
    userId: userA,
    state: "approved",
    amount: "3.75",
    amountUsd: "3.75",
    createdAt: "2002-01-01T00:00:00.000Z",
  });
  await insertWithdrawal({
    id: ids.foreign,
    userId: userB,
    state: "pending",
    amount: "4.00",
    amountUsd: "4.00",
    createdAt: "2003-01-01T00:00:00.000Z",
  });
});

after(async () => {
  if (!integrationConfigured) return;
  await withDb(async (client) => {
    await client.query("DELETE FROM withdrawals WHERE user_id = ANY($1::text[])", [
      [userA, userB],
    ]);
    return true;
  });
});

describe("PostgreSQL withdrawal read authority", () => {
  it(
    "enforces owner scope without fabricating a missing record",
    { skip: !integrationConfigured },
    async () => {
      const denied = await readWithdrawal(ids.oldest, userB);
      assert.deepEqual(denied, { ok: true, withdrawal: null });

      const owned = await readWithdrawal(ids.oldest, userA);
      assert.equal(owned.ok, true);
      if (!owned.ok || !owned.withdrawal) return;
      assert.equal(owned.withdrawal.id, ids.oldest);
      assert.equal(owned.withdrawal.userId, userA);
      assert.equal(owned.withdrawal.amount, "1.25");
      assert.equal(owned.withdrawal.amountUsd, 1.25);
      assert.equal(owned.withdrawal.state, "pending");
      assert.equal(owned.withdrawal.createdAt, "2000-01-01T00:00:00.000Z");
      assert.equal(owned.withdrawal.updatedAt, "2000-01-01T00:00:00.000Z");

      const adminProjection = await readWithdrawal(ids.oldest);
      assert.equal(adminProjection.ok, true);
      if (!adminProjection.ok) return;
      assert.equal(adminProjection.withdrawal?.userId, userA);
    },
  );

  it(
    "bounds user pagination and returns only the requested principal",
    { skip: !integrationConfigured },
    async () => {
      const firstPage = await listUserWithdrawalsStrict(userA, 1, 0);
      assert.equal(firstPage.ok, true);
      if (!firstPage.ok) return;
      assert.deepEqual(
        firstPage.withdrawals.map((withdrawal) => withdrawal.id),
        [ids.newest],
      );

      const normalized = await listUserWithdrawalsStrict(userA, -10, -20);
      assert.equal(normalized.ok, true);
      if (!normalized.ok) return;
      assert.deepEqual(
        normalized.withdrawals.map((withdrawal) => withdrawal.id),
        [ids.newest],
      );
      assert.equal(
        normalized.withdrawals.every((withdrawal) => withdrawal.userId === userA),
        true,
      );
    },
  );

  it(
    "filters the Admin review queue and preserves deterministic oldest-first order",
    { skip: !integrationConfigured },
    async () => {
      const result = await listPendingReviewWithdrawalsStrict(200, 0);
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const returnedIds = result.withdrawals.map((withdrawal) => withdrawal.id);
      const oldestIndex = returnedIds.indexOf(ids.oldest);
      const middleIndex = returnedIds.indexOf(ids.middle);
      assert.notEqual(oldestIndex, -1);
      assert.notEqual(middleIndex, -1);
      assert.equal(returnedIds.includes(ids.newest), false);
      assert.ok(oldestIndex < middleIndex);
    },
  );
});
