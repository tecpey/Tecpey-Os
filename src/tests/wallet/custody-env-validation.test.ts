import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { ADMIN_AUTH_ENV_SECRET_NAMES, adminAuthEnvFixture } from "../../../scripts/admin-auth-env-test-fixture";

type EnvOverrides = Record<string, string | undefined>;

function baseProductionEnv(): NodeJS.ProcessEnv {
  const secret = (label: string) => `${label}-${"x".repeat(48)}`;
  return {
    ...process.env,
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://tecpey.test",
    NEXT_PUBLIC_API_URL: "https://tecpey.test/api",
    NEXT_PUBLIC_API_BACKEND_URL: "https://backend.tecpey.test",
    NEXT_PUBLIC_API_SOCKET_URL: "wss://tecpey.test/ws",
    TECPEY_SESSION_SECRET: secret("session"),
    ...adminAuthEnvFixture(secret),
    TECPEY_REFRESH_SECRET: secret("refresh"),
    TECPEY_ACADEMY_AUTH_SECRET: secret("academy"),
    CERTIFICATE_SIGNING_SECRET: secret("certificate"),
    TECPEY_WITHDRAWAL_PRICE_SECRET: secret("withdrawal-price"),
    TECPEY_OFFLINE_SYNC_SECRET: secret("offline"),
    TECPEY_CRM_PII_KEY_B64: Buffer.alloc(32, 7).toString("base64"),
    TECPEY_CRM_CONTACT_HASH_SECRET: secret("crm-contact"),
    TECPEY_PHONE_IDENTITY_HASH_SECRET: secret("phone-identity"),
    TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64: Buffer.alloc(32, 9).toString("base64"),
    TECPEY_PROVIDER_SECRET_ENCRYPTION_KEY_B64: Buffer.alloc(32, 10).toString("base64"),
    LIMOO_SMS_API_KEY: "limoo-test-api-key",
    LIMOO_SMS_PATTERN_ID: "42",
    TECPEY_TRUSTED_PROXY_HEADER: "x-real-ip",
    TECPEY_TRUSTED_PROXY_HOPS: "1",
    DATABASE_URL: "postgresql://tecpey:test@127.0.0.1:5432/tecpey",
    REDIS_URL: "redis://127.0.0.1:6379",
    TECPEY_ALLOW_MEMORY_RATE_LIMIT: "1",
    TECPEY_CUSTODY_KILL_SWITCH: "1",
  };
}

function validate(overrides: EnvOverrides = {}) {
  return spawnSync(process.execPath, ["scripts/validate-env.mjs"], {
    cwd: process.cwd(),
    env: { ...baseProductionEnv(), ...overrides },
    encoding: "utf8",
  });
}

describe("production custody environment validation", () => {
  it("allows production boot only in explicit custody-disabled mode", () => {
    const result = validate();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /environment validation passed/);
  });

  it("requires a governed numeric Limoo Pattern ID", () => {
    for (const value of ["", "0", "12.5", "pattern-42", "2147483648"]) {
      const result = validate({ LIMOO_SMS_PATTERN_ID: value });
      assert.notEqual(result.status, 0, `LIMOO_SMS_PATTERN_ID=${value} must fail validation`);
      assert.match(result.stderr, /LIMOO_SMS_PATTERN_ID/);
    }
  });

  it("requires strong, isolated administrator authentication secrets", () => {
    const requiredAdminSecrets = ADMIN_AUTH_ENV_SECRET_NAMES;

    for (const name of requiredAdminSecrets) {
      const result = validate({ [name]: "" });
      assert.notEqual(result.status, 0, `${name} must fail production env validation`);
      assert.match(result.stderr, new RegExp(`${name} is missing`));
    }

    const shortSecret = validate({ TECPEY_ADMIN_SESSION_SECRET: "too-short" });
    assert.notEqual(shortSecret.status, 0);
    assert.match(shortSecret.stderr, /TECPEY_ADMIN_SESSION_SECRET must be at least 32 characters/);

    const reusedSecret = `reused-${"x".repeat(48)}`;
    const reused = validate({
      TECPEY_SESSION_SECRET: reusedSecret,
      TECPEY_ADMIN_SESSION_SECRET: reusedSecret,
    });
    assert.notEqual(reused.status, 0);
    assert.match(
      reused.stderr,
      /TECPEY_SESSION_SECRET and TECPEY_ADMIN_SESSION_SECRET must be distinct/,
    );
  });

  it("rejects real withdrawal activation", () => {
    const result = validate({ TECPEY_REAL_WITHDRAWALS_ENABLED: "1" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /forbidden until the custody launch gate/);
  });

  it("rejects controlled-launch disabled product activation flags", () => {
    const cases: Array<[string, string, RegExp]> = [
      ["FEATURE_EXCHANGE_ENABLED", "true", /FEATURE_EXCHANGE_ENABLED=true is forbidden/],
      ["FEATURE_MARKETPLACE_ENABLED", "true", /FEATURE_MARKETPLACE_ENABLED=true is forbidden/],
      ["TECPEY_PUBLIC_FINANCIAL_REWARDS_ENABLED", "1", /PUBLIC_FINANCIAL_REWARDS_ENABLED=1 is forbidden/],
      ["TECPEY_ENTERPRISE_ACTIVATION_ENABLED", "1", /ENTERPRISE_ACTIVATION_ENABLED=1 is forbidden/],
      ["TECPEY_WHITE_LABEL_ACTIVATION_ENABLED", "1", /WHITE_LABEL_ACTIVATION_ENABLED=1 is forbidden/],
    ];

    for (const [name, value, pattern] of cases) {
      const result = validate({ [name]: value });
      assert.notEqual(result.status, 0, `${name} must fail production env validation`);
      assert.match(result.stderr, pattern);
    }
  });

  it("rejects raw environment private keys without printing secret material", () => {
    const privateKey = "private-key-material-must-never-appear";
    const result = validate({ WALLET_ETHEREUM_PRIVATE_KEY: privateKey });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Environment-backed wallet private keys are forbidden/);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(privateKey));
    assert.doesNotMatch(
      `${result.stdout}\n${result.stderr}`,
      /WALLET_ETHEREUM_PRIVATE_KEY/,
    );
  });

  it("rejects production simulation and unimplemented signer configuration", () => {
    const simulation = validate({ TECPEY_CUSTODY_SIMULATION_ENABLED: "1" });
    assert.notEqual(simulation.status, 0);
    assert.match(simulation.stderr, /SIMULATION_ENABLED=1 is forbidden/);

    const hsm = validate({ HSM_KEY_ID: "key-1" });
    assert.notEqual(hsm.status, 0);
    assert.match(hsm.stderr, /HSM\/MPC custody configuration is forbidden/);
  });

  it("rejects unknown chain allowlist values", () => {
    const result = validate({
      TECPEY_CUSTODY_ENABLED_CHAINS: "ethereum,unknown-chain",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /contains unsupported chains/);
  });
});
