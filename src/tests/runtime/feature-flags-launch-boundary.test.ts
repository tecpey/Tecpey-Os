import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getAllFlags, isFeatureEnabled } from "../../lib/feature-flags";

const FLAG_ENV = [
  "FEATURE_ACADEMY_ENABLED",
  "FEATURE_EXCHANGE_ENABLED",
  "FEATURE_SOCIAL_ENABLED",
  "FEATURE_MENTOR_ENABLED",
  "FEATURE_MARKETPLACE_ENABLED",
];

const originalEnv = Object.fromEntries(FLAG_ENV.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of FLAG_ENV) {
    const value = originalEnv[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("controlled launch feature flags", () => {
  it("keeps real-money and expanded commercial surfaces disabled by default", () => {
    for (const name of FLAG_ENV) delete process.env[name];

    assert.equal(isFeatureEnabled("academy.enabled"), true);
    assert.equal(isFeatureEnabled("mentor.enabled"), true);
    assert.equal(isFeatureEnabled("social.enabled"), false);
    assert.equal(isFeatureEnabled("exchange.enabled"), false);
    assert.equal(isFeatureEnabled("future.marketplace.enabled"), false);
  });

  it("reports the launch-safe flag snapshot to health callers", () => {
    for (const name of FLAG_ENV) delete process.env[name];

    assert.deepEqual(getAllFlags(), {
      "academy.enabled": true,
      "exchange.enabled": false,
      "social.enabled": false,
      "mentor.enabled": true,
      "future.marketplace.enabled": false,
    });
  });

  it("still allows explicit non-production test overrides through the flag authority", () => {
    process.env.FEATURE_EXCHANGE_ENABLED = "true";
    process.env.FEATURE_MARKETPLACE_ENABLED = "true";

    assert.equal(isFeatureEnabled("exchange.enabled"), true);
    assert.equal(isFeatureEnabled("future.marketplace.enabled"), true);
  });
});
