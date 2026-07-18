import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertSupportedWalletKeyStoreConfig,
  configuredUnsupportedKeyStores,
} from "@/lib/wallet/signing/runtime-guard";

describe("wallet keystore runtime guard", () => {
  it("allows current hot-wallet configuration", () => {
    assert.doesNotThrow(() =>
      assertSupportedWalletKeyStoreConfig({
        WALLET_BITCOIN_PRIVATE_KEY: "a".repeat(64),
      }),
    );
  });

  it("fails closed when any HSM configuration is present", () => {
    assert.deepEqual(
      configuredUnsupportedKeyStores({ HSM_ENDPOINT: "https://hsm.invalid" }),
      ["hsm"],
    );
    assert.throws(
      () => assertSupportedWalletKeyStoreConfig({ HSM_KEY_ID: "key-1" }),
      /HSM\/MPC signing is not implemented/,
    );
  });

  it("fails closed when any MPC configuration is present", () => {
    assert.deepEqual(
      configuredUnsupportedKeyStores({ MPC_PARTY_ID: "party-1" }),
      ["mpc"],
    );
    assert.throws(
      () => assertSupportedWalletKeyStoreConfig({ MPC_ENDPOINT: "https://mpc.invalid" }),
      /HSM\/MPC signing is not implemented/,
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
