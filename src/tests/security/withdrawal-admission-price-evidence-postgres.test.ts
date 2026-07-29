import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { recordWithdrawalPriceSnapshot } from "../../lib/security/withdrawal-price-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

type SnapshotRow = {
  id: string;
  asset: string;
  price: string;
  observed_at: Date;
  policy_version: string;
};

async function loadSnapshot(id: string): Promise<SnapshotRow> {
  const result = await withDb(async (client) => {
    const rows = await client.query<SnapshotRow>(
      `SELECT id, asset, price::text AS price, observed_at, policy_version
         FROM withdrawal_price_snapshots
        WHERE id = $1`,
      [id],
    );
    return rows.rows[0] ?? null;
  });
  if (!result.enabled || !result.value) throw new Error("snapshot unavailable");
  return result.value;
}

async function directInsert(input: {
  withdrawalId: string;
  userId: string;
  snapshot: SnapshotRow;
  amount: string;
  amountUsd: string;
}): Promise<void> {
  const result = await withDb(async (client) => {
    await client.query(
      `INSERT INTO withdrawals (
         id, user_id, asset, amount, amount_usd, destination_address,
         network, state, security_gate_passed, two_fa_verified,
         price_snapshot_id, price_usd, price_observed_at,
         admission_policy_version
       ) VALUES (
         $1,$2,$3,$4,$5,$6,'ethereum','compliance_review',TRUE,TRUE,
         $7,$8,$9,$10
       )`,
      [
        input.withdrawalId,
        input.userId,
        input.snapshot.asset,
        input.amount,
        input.amountUsd,
        `0x${"a".repeat(40)}`,
        input.snapshot.id,
        input.snapshot.price,
        input.snapshot.observed_at,
        input.snapshot.policy_version,
      ],
    );
    return true;
  });
  assert.equal(result.enabled, true);
}

async function cleanup(withdrawalId: string, snapshotId: string): Promise<void> {
  await withDb(async (client) => {
    await client.query("DELETE FROM withdrawals WHERE id = $1", [withdrawalId]);
    await client.query("DELETE FROM withdrawal_price_snapshots WHERE id = $1", [
      snapshotId,
    ]);
    return true;
  });
}

describe("Database-owned withdrawal price evidence", () => {
  it(
    "accepts a fresh matching snapshot",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const snapshotId = await recordWithdrawalPriceSnapshot({
        asset: "USDC",
        priceUsd: "1",
        source: "ci-db-price-trigger-valid",
        ttlSeconds: 120,
      });
      assert.ok(snapshotId);
      const snapshot = await loadSnapshot(snapshotId!);
      try {
        await directInsert({
          withdrawalId,
          userId: `price-trigger-valid-${randomUUID()}`,
          snapshot,
          amount: "2.5",
          amountUsd: "2.5",
        });
      } finally {
        await cleanup(withdrawalId, snapshotId!);
      }
    },
  );

  it(
    "rejects a stale snapshot even when it has not expired",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const snapshotId = await recordWithdrawalPriceSnapshot({
        asset: "USDC",
        priceUsd: "1",
        source: "ci-db-price-trigger-stale",
        observedAt: new Date(Date.now() - 3 * 60_000),
        ttlSeconds: 300,
      });
      assert.ok(snapshotId);
      const snapshot = await loadSnapshot(snapshotId!);
      try {
        await assert.rejects(
          () =>
            directInsert({
              withdrawalId,
              userId: `price-trigger-stale-${randomUUID()}`,
              snapshot,
              amount: "1",
              amountUsd: "1",
            }),
          /withdrawal price evidence invalid or stale/,
        );
      } finally {
        await cleanup(withdrawalId, snapshotId!);
      }
    },
  );

  it(
    "rejects client-style amountUsd manipulation against a valid snapshot",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const snapshotId = await recordWithdrawalPriceSnapshot({
        asset: "USDC",
        priceUsd: "1",
        source: "ci-db-price-trigger-mismatch",
        ttlSeconds: 120,
      });
      assert.ok(snapshotId);
      const snapshot = await loadSnapshot(snapshotId!);
      try {
        await assert.rejects(
          () =>
            directInsert({
              withdrawalId,
              userId: `price-trigger-mismatch-${randomUUID()}`,
              snapshot,
              amount: "1000",
              amountUsd: "1",
            }),
          /withdrawal price evidence invalid or stale/,
        );
      } finally {
        await cleanup(withdrawalId, snapshotId!);
      }
    },
  );
});
