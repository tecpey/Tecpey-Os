import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withDb } from "../../lib/db";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

describe("Terminal withdrawal reservation metadata", () => {
  for (const terminalState of ["rejected", "blocked", "cancelled"] as const) {
    it(
      `${terminalState} clears funds_reserved_at in PostgreSQL`,
      { skip: !integrationConfigured, timeout: 30_000 },
      async () => {
        const userId = `withdraw-terminal-${terminalState}-${randomUUID()}`;
        const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
        try {
          const result = await withDb(async (client) => {
            await client.query(
              `INSERT INTO withdrawals (
                 id, user_id, asset, amount, amount_usd, destination_address,
                 network, state, security_gate_passed, two_fa_verified,
                 funds_reserved_at
               ) VALUES ($1,$2,'USDT','1',1,$3,'ethereum','compliance_review',TRUE,TRUE,NOW())`,
              [withdrawalId, userId, `0x${"a".repeat(40)}`],
            );
            await client.query(
              "UPDATE withdrawals SET state = $1 WHERE id = $2 AND user_id = $3",
              [terminalState, withdrawalId, userId],
            );
            const evidence = await client.query<{
              state: string;
              funds_reserved_at: Date | null;
            }>(
              "SELECT state, funds_reserved_at FROM withdrawals WHERE id = $1 AND user_id = $2",
              [withdrawalId, userId],
            );
            return evidence.rows[0];
          });
          assert.equal(result.enabled, true);
          if (result.enabled) {
            assert.equal(result.value?.state, terminalState);
            assert.equal(result.value?.funds_reserved_at, null);
          }
        } finally {
          await withDb(async (client) => {
            await client.query("DELETE FROM withdrawals WHERE id = $1 AND user_id = $2", [
              withdrawalId,
              userId,
            ]);
            return true;
          });
        }
      },
    );
  }
});
