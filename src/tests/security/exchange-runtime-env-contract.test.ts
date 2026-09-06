import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

type EnvOverrides = Record<string, string | undefined>;

const adminBootstrapEnvName = readFileSync(
  "scripts/fixtures/admin-bootstrap-env-name.txt",
  "utf8",
).trim();

function secret(label: string): string {
  return `${label}-${"x".repeat(48)}`;
}

function baseProductionEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://tecpey.test",
    NEXT_PUBLIC_API_URL: "https://tecpey.test/api",
    NEXT_PUBLIC_API_BACKEND_URL: "https://backend.tecpey.test",
    NEXT_PUBLIC_API_SOCKET_URL: "wss://tecpey.test/ws",
    TECPEY_SESSION_SECRET: secret("session"),
    TECPEY_ADMIN_SESSION_SECRET: secret("admin-session"),
    TECPEY_2FA_SECRET: secret("two-factor"),
    [adminBootstrapEnvName]: secret("admin-bootstrap"),
    TECPEY_REFRESH_SECRET: secret("refresh"),
    TECPEY_ACADEMY_AUTH_SECRET: secret("academy"),
    CERTIFICATE_SIGNING_SECRET: secret("certificate"),
    TECPEY_WITHDRAWAL_PRICE_SECRET: secret("withdrawal-price"),
    TECPEY_OFFLINE_SYNC_SECRET: secret("offline-sync"),
    TECPEY_CRM_PII_KEY_B64: Buffer.alloc(32, 7).toString("base64"),
    TECPEY_CRM_CONTACT_HASH_SECRET: secret("crm-contact"),
    TECPEY_PHONE_IDENTITY_HASH_SECRET: secret("phone-identity"),
    TECPEY_PHONE_OTP_ENCRYPTION_KEY_B64: Buffer.alloc(32, 9).toString("base64"),
    TECPEY_PROVIDER_SECRET_ENCRYPTION_KEY_B64: Buffer.alloc(32, 10).toString("base64"),
    TECPEY_TRUSTED_PROXY_HEADER: "x-real-ip",
    TECPEY_TRUSTED_PROXY_HOPS: "1",
    DATABASE_URL: "postgresql://tecpey:test@127.0.0.1:5432/tecpey",
    REDIS_URL: "redis://127.0.0.1:6379",
    TECPEY_ALLOW_MEMORY_RATE_LIMIT: "1",
    TECPEY_CUSTODY_KILL_SWITCH: "1",
  };
}

function validate(overrides: EnvOverrides = {}) {
  const env = { ...baseProductionEnv(), ...overrides };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return spawnSync(process.execPath, ["scripts/validate-env.mjs"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
}

describe("Exchange runtime deployment environment contract", () => {
  it("preserves Core-only deployments while Exchange remains unconfigured", () => {
    const result = validate();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /environment validation passed/i);
  });

  it("requires both isolated runtime keys when the Exchange origin is activated", () => {
    const result = validate({
      TECPEY_EXCHANGE_ORIGIN: "https://exchange.tecpey.test",
      TECPEY_EXCHANGE_SESSION_SECRET_V1: undefined,
      TECPEY_IDENTITY_LINK_FINGERPRINT_KEY_V1: undefined,
    });

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /TECPEY_EXCHANGE_SESSION_SECRET_V1 is required when TECPEY_EXCHANGE_ORIGIN is configured/,
    );
    assert.match(
      result.stderr,
      /TECPEY_IDENTITY_LINK_FINGERPRINT_KEY_V1 is required when TECPEY_EXCHANGE_ORIGIN is configured/,
    );
  });

  it("accepts Exchange activation only with strong distinct runtime keys", () => {
    const result = validate({
      TECPEY_EXCHANGE_ORIGIN: "https://exchange.tecpey.test",
      TECPEY_EXCHANGE_SESSION_SECRET_V1: secret("exchange-session"),
      TECPEY_IDENTITY_LINK_FINGERPRINT_KEY_V1: secret("identity-link-fingerprint"),
    });

    assert.equal(result.status, 0, result.stderr);
  });

  it("rejects short or reused Exchange security keys", () => {
    const short = validate({
      TECPEY_EXCHANGE_ORIGIN: "https://exchange.tecpey.test",
      TECPEY_EXCHANGE_SESSION_SECRET_V1: "too-short",
      TECPEY_IDENTITY_LINK_FINGERPRINT_KEY_V1: secret("identity-link-fingerprint"),
    });
    assert.notEqual(short.status, 0);
    assert.match(
      short.stderr,
      /TECPEY_EXCHANGE_SESSION_SECRET_V1 must be at least 32 characters/,
    );

    const reused = secret("exchange-shared");
    const duplicate = validate({
      TECPEY_EXCHANGE_ORIGIN: "https://exchange.tecpey.test",
      TECPEY_EXCHANGE_SESSION_SECRET_V1: reused,
      TECPEY_IDENTITY_LINK_FINGERPRINT_KEY_V1: reused,
    });
    assert.notEqual(duplicate.status, 0);
    assert.match(
      duplicate.stderr,
      /TECPEY_EXCHANGE_SESSION_SECRET_V1 and TECPEY_IDENTITY_LINK_FINGERPRINT_KEY_V1 must be distinct/,
    );
  });

  it("keeps the deployment template and executable preflight aligned", () => {
    const validator = readFileSync("scripts/validate-env.mjs", "utf8");
    const template = readFileSync(".env.production.example", "utf8");

    for (const key of [
      "TECPEY_EXCHANGE_ORIGIN",
      "TECPEY_EXCHANGE_SESSION_SECRET_V1",
      "TECPEY_IDENTITY_LINK_FINGERPRINT_KEY_V1",
    ]) {
      assert.match(validator, new RegExp(key));
      assert.match(template, new RegExp(`^${key}=`, "m"));
    }
  });
});
