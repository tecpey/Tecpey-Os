import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertSupportedWalletKeyStoreConfig,
  configuredUnsupportedKeyStores,
} from "@/lib/wallet/signing/runtime-guard";

describe("wallet keystore runtime guard", () => {
  it("allows a clean disabled production custody state", () => {
    assert.doesNotThrow(() =>
      assertSupportedWalletKeyStoreConfig({
        NODE_ENV: "production",
        TECPEY_CUSTODY_MODE: "disabled",
      }),
    );
  });

  it("forbids environment private keys in production", () => {
    assert.throws(
      () =>
        assertSupportedWalletKeyStoreConfig({
          NODE_ENV: "production",
          TECPEY_CUSTODY_MODE: "disabled",
          WALLET_BITCOIN_PRIVATE_KEY: "a".repeat(64),
        }),
      /production_environment_private_keys_forbidden/,
    );
  });

  it("fails closed when any HSM configuration is present", () => {
    assert.deepEqual(
      configuredUnsupportedKeyStores({ HSM_ENDPOINT: "https://hsm.invalid" }),
      ["hsm"],
    );
    assert.throws(
      () =>
        assertSupportedWalletKeyStoreConfig({
          NODE_ENV: "production",
          TECPEY_CUSTODY_MODE: "external_hsm",
          HSM_KEY_ID: "key-1",
        }),
      /hsm_signer_not_implemented/,
    );
  });

  it("fails closed when any MPC configuration is present", () => {
    assert.deepEqual(
      configuredUnsupportedKeyStores({ MPC_PARTY_ID: "party-1" }),
      ["mpc"],
    );
    assert.throws(
      () =>
        assertSupportedWalletKeyStoreConfig({
          NODE_ENV: "production",
          TECPEY_CUSTODY_MODE: "external_mpc",
          MPC_ENDPOINT: "https://mpc.invalid",
        }),
      /mpc_signer_not_implemented/,
    );
  });

  it("reports both unsupported backends when both are configured", () => {
    assert.deepEqual(
      configuredUnsupportedKeyStores({
        HSM_ENDPOINT: "https://hsm.invalid",
        MPC_ENDPOINT: "https://mpc.invalid",
      }),
      ["hsm", "mpc"],
    );
  });
});
