import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CustodyConfigurationError,
  CustodyGateError,
  assertCustodyBootSafe,
  assertCustodyWithdrawalAllowed,
  getCustodyRuntimeStatus,
  getPublicCustodyStatus,
} from "../../lib/wallet/custody-policy";

function productionEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: "production",
    TECPEY_CUSTODY_MODE: "disabled",
    ...overrides,
  };
}

function simulationEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: "test",
    REDIS_URL: "redis://127.0.0.1:6379",
    TECPEY_CUSTODY_MODE: "simulation",
    TECPEY_CUSTODY_ENABLED_CHAINS: "ethereum,bitcoin",
    TECPEY_CUSTODY_MAX_WITHDRAWAL_USD_ETHEREUM: "5000",
    TECPEY_CUSTODY_MAX_WITHDRAWAL_USD_BITCOIN: "2500",
    TECPEY_CUSTODY_REQUIRED_APPROVALS: "1",
    TECPEY_CUSTODY_CIRCUIT_OPEN: "0",
    TECPEY_REAL_WITHDRAWALS_ENABLED: "1",
    TECPEY_WITHDRAWAL_WORKERS_ENABLED: "1",
    ...overrides,
  };
}

describe("custody release policy", () => {
  it("defaults production to a clean disabled launch state", () => {
    const status = getCustodyRuntimeStatus(productionEnv());
    assert.equal(status.configurationValid, true);
    assert.equal(status.mode, "disabled");
    assert.equal(status.withdrawalsEnabled, false);
    assert.equal(status.workersEnabled, false);
    assert.equal(status.addressAllocationEnabled, false);
    assert.equal(status.reason, "custody_launch_gate_disabled");
    assert.deepEqual(getPublicCustodyStatus(productionEnv()), {
      policyVersion: "custody-release-gate-v1",
      operational: false,
      withdrawalsEnabled: false,
      depositAddressAllocationEnabled: false,
      reason: "custody_launch_gate_disabled",
      enabledChains: [],
    });
  });

  it("forbids raw environment private keys in production without exposing values", () => {
    const secret = "super-secret-private-key-material";
    const env = productionEnv({ WALLET_ETHEREUM_PRIVATE_KEY: secret });
    const status = getCustodyRuntimeStatus(env);
    assert.equal(status.configurationValid, false);
    assert.ok(status.errors.includes("production_environment_private_keys_forbidden"));
    assert.equal(JSON.stringify(status).includes(secret), false);
    assert.throws(
      () => assertCustodyBootSafe(env),
      (error: unknown) => {
        assert.ok(error instanceof CustodyConfigurationError);
        assert.equal(String(error).includes(secret), false);
        return true;
      },
    );
  });

  it("rejects real withdrawals, workers and address allocation without approved custody", () => {
    const status = getCustodyRuntimeStatus(
      productionEnv({
        TECPEY_REAL_WITHDRAWALS_ENABLED: "1",
        TECPEY_WITHDRAWAL_WORKERS_ENABLED: "1",
        TECPEY_CUSTODY_ADDRESS_ALLOCATION_ENABLED: "1",
        REDIS_URL: "redis://redis:6379",
      }),
    );
    assert.ok(status.errors.includes("real_withdrawals_require_approved_custody"));
    assert.ok(status.errors.includes("withdrawal_workers_require_approved_custody"));
    assert.ok(status.errors.includes("address_allocation_requires_approved_custody"));
  });

  it("rejects HSM and MPC placeholders until a verified provider exists", () => {
    const hsm = getCustodyRuntimeStatus(
      productionEnv({
        TECPEY_CUSTODY_MODE: "external_hsm",
        HSM_ENDPOINT: "https://hsm.invalid",
      }),
    );
    assert.ok(hsm.errors.includes("hsm_signer_not_implemented"));

    const mpc = getCustodyRuntimeStatus(
      productionEnv({
        TECPEY_CUSTODY_MODE: "external_mpc",
        MPC_PARTY_ID: "party-1",
      }),
    );
    assert.ok(mpc.errors.includes("mpc_signer_not_implemented"));
  });

  it("permits explicit test simulation with chain limits and workers", () => {
    const status = assertCustodyBootSafe(simulationEnv());
    assert.equal(status.signerReady, true);
    assert.equal(status.withdrawalsEnabled, true);
    assert.equal(status.workersEnabled, true);
    assert.deepEqual(status.enabledChains, ["ethereum", "bitcoin"]);
  });

  it("enforces per-chain limits and approval quorum with decimal arithmetic", () => {
    assert.doesNotThrow(() =>
      assertCustodyWithdrawalAllowed({
        chainId: "ethereum",
        amountUsd: "5000.00000000",
        approvalCount: 1,
        env: simulationEnv(),
      }),
    );
    assert.throws(
      () =>
        assertCustodyWithdrawalAllowed({
          chainId: "ethereum",
          amountUsd: "5000.00000001",
          approvalCount: 1,
          env: simulationEnv(),
        }),
      (error: unknown) =>
        error instanceof CustodyGateError &&
        error.code === "custody_withdrawal_limit_exceeded",
    );
    assert.throws(
      () =>
        assertCustodyWithdrawalAllowed({
          chainId: "ethereum",
          amountUsd: "10",
          approvalCount: 1,
          env: simulationEnv({ TECPEY_CUSTODY_REQUIRED_APPROVALS: "2" }),
        }),
      (error: unknown) =>
        error instanceof CustodyGateError &&
        error.code === "custody_approval_quorum_incomplete",
    );
  });

  it("fails closed when the circuit breaker is open or a chain is disabled", () => {
    assert.throws(
      () =>
        assertCustodyWithdrawalAllowed({
          chainId: "ethereum",
          amountUsd: "10",
          env: simulationEnv({ TECPEY_CUSTODY_CIRCUIT_OPEN: "1" }),
        }),
      CustodyGateError,
    );
    assert.throws(
      () =>
        assertCustodyWithdrawalAllowed({
          chainId: "solana",
          amountUsd: "10",
          env: simulationEnv(),
        }),
      (error: unknown) =>
        error instanceof CustodyGateError && error.code === "custody_chain_disabled",
    );
  });
});
