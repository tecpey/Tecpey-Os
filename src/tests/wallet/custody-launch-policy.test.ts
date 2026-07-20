import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCustodyCapability,
  assertProductionCustodyConfiguration,
  configuredEnvironmentPrivateKeyNames,
  getCustodyLaunchStatus,
  invalidConfiguredCustodyChains,
  isCustodyCapabilityEnabled,
  type WalletRuntimeEnv,
} from "@/lib/wallet/custody-launch-policy";

function productionEnv(
  overrides: WalletRuntimeEnv = {},
): WalletRuntimeEnv {
  return { NODE_ENV: "production", ...overrides };
}

describe("wallet custody launch policy", () => {
  it("keeps every real custody capability disabled in safe production mode", () => {
    const env = productionEnv();
    const status = getCustodyLaunchStatus(env);
    assert.deepEqual(status, {
      mode: "disabled",
      productionReady: false,
      enabled: false,
      withdrawalApprovalEnabled: false,
      workerEnabled: false,
      depositAddressAllocationEnabled: false,
      signingEnabled: false,
      broadcastEnabled: false,
      circuitBreakerOpen: false,
      enabledChains: [],
      reasons: ["custody_not_production_ready"],
    });
    assert.doesNotThrow(() => assertProductionCustodyConfiguration(env));
    assert.throws(
      () => assertCustodyCapability("transaction_signing", { env }),
      /^Error: custody_capability_disabled:transaction_signing:custody_not_production_ready$/,
    );
  });

  it("rejects production real-withdrawal activation", () => {
    const env = productionEnv({ TECPEY_REAL_WITHDRAWALS_ENABLED: "1" });
    assert.throws(
      () => assertProductionCustodyConfiguration(env),
      /real_withdrawals_forbidden/,
    );
    assert.equal(
      isCustodyCapabilityEnabled("withdrawal_approval", undefined, env),
      false,
    );
  });

  it("rejects every raw environment private key in production without exposing its value", () => {
    const secret = "super-sensitive-private-key-value";
    const env = productionEnv({
      WALLET_ETHEREUM_PRIVATE_KEY: secret,
      WALLET_BITCOIN_PRIVATE_KEY_2: secret,
    });
    assert.deepEqual(configuredEnvironmentPrivateKeyNames(env), [
      "WALLET_BITCOIN_PRIVATE_KEY_2",
      "WALLET_ETHEREUM_PRIVATE_KEY",
    ]);

    let message = "";
    try {
      assertProductionCustodyConfiguration(env);
    } catch (error) {
      message = String(error);
    }
    assert.match(message, /environment_private_keys_forbidden/);
    assert.doesNotMatch(message, new RegExp(secret));
    assert.doesNotMatch(message, /WALLET_ETHEREUM_PRIVATE_KEY/);
  });

  it("rejects unimplemented HSM and MPC activation in production", () => {
    for (const env of [
      productionEnv({ HSM_ENDPOINT: "https://hsm.invalid" }),
      productionEnv({ MPC_PARTY_ID: "party-1" }),
    ]) {
      assert.throws(
        () => assertProductionCustodyConfiguration(env),
        /unsupported_signer_backend/,
      );
    }
  });

  it("rejects simulation in production", () => {
    assert.throws(
      () =>
        assertProductionCustodyConfiguration(
          productionEnv({ TECPEY_CUSTODY_SIMULATION_ENABLED: "1" }),
        ),
      /simulation_forbidden/,
    );
  });

  it("allows development simulation but requires explicit approval flag for approval", () => {
    const env: WalletRuntimeEnv = { NODE_ENV: "test" };
    const status = getCustodyLaunchStatus(env);
    assert.equal(status.mode, "simulation");
    assert.equal(status.workerEnabled, true);
    assert.equal(status.signingEnabled, true);
    assert.equal(status.withdrawalApprovalEnabled, false);

    const approved = {
      ...env,
      TECPEY_REAL_WITHDRAWALS_ENABLED: "1",
    };
    assert.equal(
      isCustodyCapabilityEnabled("withdrawal_approval", undefined, approved),
      true,
    );
  });

  it("enforces chain allowlists and the emergency kill switch", () => {
    const env: WalletRuntimeEnv = {
      NODE_ENV: "test",
      TECPEY_REAL_WITHDRAWALS_ENABLED: "1",
      TECPEY_CUSTODY_ENABLED_CHAINS: "ethereum,solana,unknown",
    };
    assert.deepEqual(invalidConfiguredCustodyChains(env), ["unknown"]);
    assert.equal(
      isCustodyCapabilityEnabled("transaction_signing", "ethereum", env),
      true,
    );
    assert.equal(
      isCustodyCapabilityEnabled("transaction_signing", "bitcoin", env),
      false,
    );
    assert.throws(
      () =>
        assertCustodyCapability("transaction_signing", {
          chainId: "bitcoin",
          env,
        }),
      /chain_not_enabled/,
    );

    const killed = { ...env, TECPEY_CUSTODY_KILL_SWITCH: "1" };
    assert.equal(
      isCustodyCapabilityEnabled("transaction_broadcast", "ethereum", killed),
      false,
    );
  });
});
