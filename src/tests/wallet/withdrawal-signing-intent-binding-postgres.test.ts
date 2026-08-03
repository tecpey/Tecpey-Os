import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { executeWithdrawal } from "../../lib/wallet/withdrawal-executor";
import {
  setWalletProviderOverrideForTest,
  clearWalletProviderOverridesForTest,
} from "../../lib/wallet/providers/registry";
import type {
  BuildTransactionInput,
  WalletProvider,
  WithdrawalJobData,
} from "../../lib/wallet/types";

// Execution-level signing-integrity proof for the withdrawal executor (#106/#29).
//
// The launch gate keeps real custody disabled in production; this exercises the
// dev hot-wallet signing path to prove the money-moving invariant that must hold
// whenever signing IS active: the transaction the executor asks the provider to
// build is bound to the APPROVED PostgreSQL record — its amount and destination
// — never to the (untrusted, forgeable, replayable) BullMQ job payload.
//
// The provider is overridden with a probe that captures the exact
// buildTransaction input and then aborts before any signature or broadcast. The
// job carries a tampered amount and destination; the proof asserts the executor
// still asked the provider to build with the database's amount/destination, and
// that no signed transaction was persisted for the tampered attempt.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

// A valid secp256k1 test key, generated fresh at runtime so no secret-like
// literal ever enters the repository. It only enables the dev hot-wallet signer
// so keyStore.getAddress succeeds; the probe aborts before any real signing, so
// no funds could ever move regardless of the key value.
function generateSecp256k1Key(): string {
  // Any 32-byte value in [1, n-1] is a valid secp256k1 private key. Forcing the
  // top byte below 0xff keeps the value under the curve order n (whose top 15
  // bytes are 0xff); the zero-guard keeps it non-zero. No 256-bit hex literal is
  // committed, so secret scanners have nothing to flag.
  const bytes = randomBytes(32);
  bytes[0] = bytes[0] % 0xff;
  if (bytes.every((b) => b === 0)) bytes[31] = 1;
  return bytes.toString("hex");
}

const TEST_ETH_KEY = generateSecp256k1Key();

const DB_AMOUNT = "2";
const DB_DESTINATION = `0x${"a".repeat(40)}`;

let capturedBuildInput: BuildTransactionInput | null = null;
const savedEnv: Record<string, string | undefined> = {};

function makeCapturingProvider(): WalletProvider {
  const provider = {
    chainId: "ethereum",
    nativeAsset: "ETH",
    buildTransaction: async (input: BuildTransactionInput) => {
      capturedBuildInput = input;
      // Abort deterministically before signing/broadcast — nothing can move.
      throw new Error("__intent_capture_probe__");
    },
  };
  return provider as unknown as WalletProvider;
}

async function seedApprovedWithdrawal(id: string, userId: string): Promise<void> {
  const seeded = await withDb((client) =>
    client.query(
      `INSERT INTO withdrawals (
         id, user_id, asset, amount, amount_usd, destination_address,
         network, state, security_gate_passed, two_fa_verified,
         required_confirmations, funds_reserved_at
       ) VALUES ($1, $2, 'USDT', ${DB_AMOUNT}, ${DB_AMOUNT}, $3, 'ethereum',
                 'approved', TRUE, TRUE, 12, NOW())`,
      [id, userId, DB_DESTINATION],
    ),
  );
  assert.equal(seeded.enabled, true);
}

function tamperedJob(id: string): WithdrawalJobData {
  return {
    withdrawalId: id,
    chainId: "ethereum",
    asset: "USDT",
    amount: "999999999",
    amountUsd: 999999999,
    destinationAddress: `0x${"d".repeat(40)}`,
    feeSpeed: "priority",
    enqueuedAt: new Date().toISOString(),
    priority: 10,
  };
}

before(() => {
  for (const key of [
    "WALLET_ETHEREUM_PRIVATE_KEY",
    "TECPEY_CUSTODY_KILL_SWITCH",
    "TECPEY_CUSTODY_ENABLED_CHAINS",
    "HSM_ENDPOINT",
    "HSM_KEY_ID",
    "MPC_ENDPOINT",
    "MPC_PARTY_ID",
  ]) {
    savedEnv[key] = process.env[key];
  }
  process.env.WALLET_ETHEREUM_PRIVATE_KEY = TEST_ETH_KEY;
  delete process.env.TECPEY_CUSTODY_KILL_SWITCH;
  delete process.env.TECPEY_CUSTODY_ENABLED_CHAINS;
  delete process.env.HSM_ENDPOINT;
  delete process.env.HSM_KEY_ID;
  delete process.env.MPC_ENDPOINT;
  delete process.env.MPC_PARTY_ID;
});

afterEach(() => {
  clearWalletProviderOverridesForTest();
  capturedBuildInput = null;
});

after(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Withdrawal signing intent binding", () => {
  it(
    "builds the transaction from the approved DB record, not the tampered queue payload",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const id = randomUUID().replaceAll("-", "").slice(0, 32);
      const userId = `signing-intent-${randomUUID()}`;
      await seedApprovedWithdrawal(id, userId);

      setWalletProviderOverrideForTest("ethereum", makeCapturingProvider());

      // The job's amount/destination are deliberately wrong. If the executor
      // trusted the queue, the provider would be asked to build a 999999999 / 0xdd…
      // transaction — the exact fund-redirection this must prevent.
      await assert.rejects(
        executeWithdrawal(tamperedJob(id)),
        /__intent_capture_probe__/,
        "the executor must reach the provider build step and then abort on the probe",
      );

      assert.ok(capturedBuildInput, "provider.buildTransaction must have been invoked");
      const built = capturedBuildInput!;
      assert.equal(built.withdrawalId, id);
      assert.equal(built.chainId, "ethereum");
      assert.equal(
        built.amount,
        DB_AMOUNT,
        "the signer must build the DB record's amount, not the queue's tampered amount",
      );
      assert.equal(
        built.destinationAddress,
        DB_DESTINATION,
        "the signer must build the DB record's destination, not the queue's tampered destination",
      );
      assert.notEqual(built.amount, "999999999");
      assert.notEqual(built.destinationAddress, `0x${"d".repeat(40)}`);

      // No signed transaction may have been persisted for the aborted attempt.
      const persisted = await withDb((client) =>
        client.query<{ raw_tx: Buffer | null; tx_hash: string | null }>(
          "SELECT raw_tx, tx_hash FROM withdrawals WHERE id = $1",
          [id],
        ),
      );
      assert.equal(persisted.enabled, true);
      if (persisted.enabled) {
        assert.equal(persisted.value.rows[0]?.raw_tx, null);
        assert.equal(persisted.value.rows[0]?.tx_hash, null);
      }
    },
  );

  it("refuses to install a provider override in production", () => {
    // NODE_ENV is typed read-only; mutate through a plain-record view.
    const env = process.env as Record<string, string | undefined>;
    const original = env.NODE_ENV;
    try {
      // Synchronous window: setting NODE_ENV and calling the (synchronous) guard
      // cannot interleave with other tests in a single-threaded process.
      env.NODE_ENV = "production";
      assert.throws(
        () => setWalletProviderOverrideForTest("ethereum", makeCapturingProvider()),
        /forbidden_in_production/,
      );
      assert.throws(
        () => clearWalletProviderOverridesForTest(),
        /forbidden_in_production/,
      );
    } finally {
      if (original === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = original;
    }
  });
});
