import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { emailDeliveryReadiness, isEmailConfigured, sendEmail } from "../../lib/email";

// Email delivery is a capability claim: preflight, health and the actual send path
// must agree about whether messages can leave the process. These tests deliberately
// cover live, simulated, disabled and invalid postures so production can never
// degrade into a fake successful development send.

const KEYS = ["NODE_ENV", "EMAIL_PROVIDER", "RESEND_API_KEY", "SENDGRID_API_KEY"] as const;
const SUPPLIED = "unit-test-value";
const ORIGINAL = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function withEnv<T>(values: Partial<Record<(typeof KEYS)[number], string>>, run: () => T): T {
  try {
    for (const key of KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
    return run();
  } finally {
    for (const key of KEYS) {
      const previous = ORIGINAL[key];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  }
}

test("a live provider with a usable key is configured", () => {
  withEnv({ NODE_ENV: "production", EMAIL_PROVIDER: "resend", RESEND_API_KEY: SUPPLIED }, () => {
    assert.equal(isEmailConfigured(), true);
  });
  withEnv({ NODE_ENV: "production", EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: SUPPLIED }, () => {
    assert.equal(isEmailConfigured(), true);
  });
});

test("provider normalization is shared by readiness, health and send", () => {
  withEnv({ NODE_ENV: "production", EMAIL_PROVIDER: " resend ", RESEND_API_KEY: SUPPLIED }, () => {
    assert.equal(isEmailConfigured(), true, "surrounding whitespace must not silently disable email");
  });
  withEnv({ NODE_ENV: "production", EMAIL_PROVIDER: "SendGrid", SENDGRID_API_KEY: SUPPLIED }, () => {
    assert.equal(isEmailConfigured(), true);
  });
});

test("placeholder, whitespace and wrong-provider keys are never credentials", () => {
  for (const key of ["CHANGE_ME", "your-real-key-here", "REPLACE_WITH_KEY", "   "]) {
    withEnv({ NODE_ENV: "production", EMAIL_PROVIDER: "resend", RESEND_API_KEY: key }, () => {
      assert.equal(isEmailConfigured(), false, `${JSON.stringify(key)} must not count as configured`);
    });
  }
  withEnv(
    { NODE_ENV: "production", EMAIL_PROVIDER: "sendgrid", RESEND_API_KEY: SUPPLIED },
    () => assert.equal(isEmailConfigured(), false),
  );
});

test("production classifies every non-delivering posture explicitly", () => {
  assert.deepEqual(emailDeliveryReadiness({ NODE_ENV: "production" }), {
    status: "unconfigured",
    provider: null,
    mode: "disabled",
    reason: "provider_not_configured",
  });
  assert.deepEqual(
    emailDeliveryReadiness({ NODE_ENV: "production", EMAIL_PROVIDER: "dev" }),
    {
      status: "misconfigured",
      provider: "dev",
      mode: "blocked",
      reason: "development_provider_forbidden_in_production",
    },
  );
  assert.deepEqual(
    emailDeliveryReadiness({ NODE_ENV: "production", EMAIL_PROVIDER: "none" }),
    {
      status: "misconfigured",
      provider: "none",
      mode: "blocked",
      reason: "disabled_provider_forbidden_in_production",
    },
  );
  assert.deepEqual(
    emailDeliveryReadiness({ NODE_ENV: "production", EMAIL_PROVIDER: "mailgun" }),
    {
      status: "misconfigured",
      provider: "mailgun",
      mode: "blocked",
      reason: "unsupported_provider",
    },
  );
});

test("production send path never falls back to a fake dev success", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("blocked email posture must not attempt network delivery");
  }) as typeof fetch;

  try {
    const cases = [
      {},
      { EMAIL_PROVIDER: "dev" },
      { EMAIL_PROVIDER: "none" },
      { EMAIL_PROVIDER: "mailgun" },
      { EMAIL_PROVIDER: "resend" },
      { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "CHANGE_ME" },
      { EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: "REPLACE_WITH_KEY" },
    ] as const;

    for (const values of cases) {
      const result = await withEnv(
        { NODE_ENV: "production", ...values },
        () => sendEmail({ to: "u@tecpey.ir", subject: "s", text: "t" }),
      );
      assert.equal(result.ok, false, `production must reject ${JSON.stringify(values)}`);
      assert.ok(result.error, "blocked production send must expose a stable reason code");
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("live providers with unusable keys are refused without a network round-trip", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("email must not attempt delivery with an unusable key");
  }) as typeof fetch;
  try {
    for (const [provider, keyName] of [
      ["resend", "RESEND_API_KEY"],
      ["sendgrid", "SENDGRID_API_KEY"],
    ] as const) {
      const result = await withEnv(
        { NODE_ENV: "production", EMAIL_PROVIDER: provider, [keyName]: "CHANGE_ME" },
        () => sendEmail({ to: "u@tecpey.ir", subject: "s", text: "t" }),
      );
      assert.equal(result.ok, false);
      assert.equal(result.provider, provider);
      assert.equal(result.error, "provider_key_placeholder");
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("non-production simulation and disablement remain explicit", async () => {
  const dev = await withEnv(
    { NODE_ENV: "development", EMAIL_PROVIDER: "dev" },
    () => sendEmail({ to: "u@tecpey.ir", subject: "s", text: "t" }),
  );
  assert.equal(dev.ok, true);
  assert.equal(dev.provider, "dev");

  const defaultDev = await withEnv(
    { NODE_ENV: "test" },
    () => sendEmail({ to: "u@tecpey.ir", subject: "s", text: "t" }),
  );
  assert.equal(defaultDev.ok, true);
  assert.equal(defaultDev.provider, "dev");

  const disabled = await withEnv(
    { NODE_ENV: "development", EMAIL_PROVIDER: "none" },
    () => sendEmail({ to: "u@tecpey.ir", subject: "s", text: "t" }),
  );
  assert.equal(disabled.ok, false);
  assert.equal(disabled.provider, "none");
  assert.equal(disabled.error, "delivery_disabled");
});

test("sending and reporting consume one readiness authority", () => {
  const source = readFileSync("src/lib/email.ts", "utf8");
  assert.equal(
    (source.match(/env\.EMAIL_PROVIDER/g) ?? []).length,
    1,
    "EMAIL_PROVIDER must be interpreted inside the readiness authority only",
  );
  assert.match(source, /const readiness = emailDeliveryReadiness\(\);/);
  assert.match(source, /return emailDeliveryReadiness\(\)\.status === "configured"/);
});
