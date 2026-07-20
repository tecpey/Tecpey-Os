import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withDb } from "../../lib/db";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

async function seedReservedWithdrawal(input: {
  withdrawalId: string;
  userId: string;
}): Promise<void> {
  const inserted = await withDb(async (client) => {
    await client.query(
      `INSERT INTO withdrawals (
         id, user_id, asset, amount, amount_usd, destination_address,
         network, state, security_gate_passed, two_fa_verified,
         funds_reserved_at
       ) VALUES ($1,$2,'USDT','1',1,$3,'ethereum','compliance_review',TRUE,TRUE,NOW())`,
      [input.withdrawalId, input.userId, `0x${"a".repeat(40)}`],
    );
    return true;
  });
  assert.equal(inserted.enabled, true);
}

async function readWithdrawal(input: {
  withdrawalId: string;
  userId: string;
}): Promise<{ state: string; funds_reserved_at: Date | null } | undefined> {
  const result = await withDb(async (client) => {
    const evidence = await client.query<{
      state: string;
      funds_reserved_at: Date | null;
    }>(
      "SELECT state, funds_reserved_at FROM withdrawals WHERE id = $1 AND user_id = $2",
      [input.withdrawalId, input.userId],
    );
    return evidence.rows[0];
  });
  assert.equal(result.enabled, true);
  return result.enabled ? result.value : undefined;
}

async function cleanup(input: {
  withdrawalId: string;
  userId: string;
}): Promise<void> {
  await withDb(async (client) => {
    await client.query("DELETE FROM withdrawals WHERE id = $1 AND user_id = $2", [
      input.withdrawalId,
      input.userId,
    ]);
    return true;
  });
}

describe("Terminal withdrawal reservation metadata", () => {
  for (const terminalState of ["rejected", "blocked"] as const) {
    it(
      `${terminalState} clears funds_reserved_at in PostgreSQL`,
      { skip: !integrationConfigured, timeout: 30_000 },
      async () => {
        const userId = `withdraw-terminal-${terminalState}-${randomUUID()}`;
        const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
        try {
          await seedReservedWithdrawal({ withdrawalId, userId });
          const updated = await withDb(async (client) => {
            await client.query(
              "UPDATE withdrawals SET state = $1 WHERE id = $2 AND user_id = $3",
              [terminalState, withdrawalId, userId],
            );
            return true;
          });
          assert.equal(updated.enabled, true);

          const evidence = await readWithdrawal({ withdrawalId, userId });
          assert.equal(evidence?.state, terminalState);
          assert.equal(evidence?.funds_reserved_at, null);
        } finally {
          await cleanup({ withdrawalId, userId });
        }
      },
    );
  }

  it(
    "rejects a direct cancelled transition without the canonical receipt and release evidence",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `withdraw-terminal-cancelled-${randomUUID()}`;
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      try {
        await seedReservedWithdrawal({ withdrawalId, userId });
        await assert.rejects(
          () =>
            withDb(async (client) => {
              await client.query(
                "UPDATE withdrawals SET state = 'cancelled' WHERE id = $1 AND user_id = $2",
                [withdrawalId, userId],
              );
              return true;
            }),
          /withdrawal cancellation receipt evidence is missing/,
        );

        const evidence = await readWithdrawal({ withdrawalId, userId });
        assert.equal(evidence?.state, "compliance_review");
        assert.ok(evidence?.funds_reserved_at instanceof Date);
      } finally {
        await cleanup({ withdrawalId, userId });
      }
    },
  );
});
