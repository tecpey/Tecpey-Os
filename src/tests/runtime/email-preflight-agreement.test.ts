import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { emailDeliveryReadiness } from "../../lib/email";

// Review finding on #520: a deployment gate must not accept a delivery posture
// that the runtime later reports as unavailable. The validator below imports the
// same runtime authority used by sendEmail()/isEmailConfigured(), and the governed
// Ubuntu preflight tightens the otherwise-valid "unconfigured" state into a hard
// requirement before candidate startup.

const EMAIL_INPUT_KEYS = [
  "EMAIL_PROVIDER",
  "RESEND_API_KEY",
  "SENDGRID_API_KEY",
  "ALERT_WEBHOOK_URL",
] as const;
const SUPPLIED = "unit-test-value";

type EmailValidatorInput = Partial<Record<(typeof EMAIL_INPUT_KEYS)[number], string>>;
type TestNodeEnv = "development" | "production" | "test";

function validatorRejects(
  values: EmailValidatorInput,
  requireLiveEmail = false,
  nodeEnv: TestNodeEnv = "production",
): boolean {
  const childEnv = {
    ...process.env,
    ...Object.fromEntries(EMAIL_INPUT_KEYS.map((key) => [key, ""])),
    ...values,
    NODE_ENV: nodeEnv,
    ALERT_WEBHOOK_URL: "",
  } as NodeJS.ProcessEnv;
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/validate-alert-webhook-env.ts",
      ...(requireLiveEmail ? ["--require-live-email"] : []),
    ],
    {
      encoding: "utf8",
      env: childEnv,
    },
  );
  return child.status !== 0;
}

test("production env gate rejects explicit non-delivering and invalid email configurations", () => {
  for (const values of [
    { EMAIL_PROVIDER: "dev" },
    { EMAIL_PROVIDER: "none" },
    { EMAIL_PROVIDER: "mailgun" },
    { EMAIL_PROVIDER: "resend" },
    { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "   " },
    { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "CHANGE_ME" },
    { EMAIL_PROVIDER: "sendgrid" },
    { EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: "REPLACE_WITH_KEY" },
  ]) {
    assert.equal(
      validatorRejects(values),
      true,
      `production env gate must reject ${JSON.stringify(values)}`,
    );
  }
});

test("production env gate accepts only usable live provider credentials when one is selected", () => {
  for (const values of [
    { EMAIL_PROVIDER: "resend", RESEND_API_KEY: SUPPLIED },
    { EMAIL_PROVIDER: " sendgrid ", SENDGRID_API_KEY: SUPPLIED },
  ]) {
    assert.equal(
      validatorRejects(values),
      false,
      `production env gate must accept ${JSON.stringify(values)}`,
    );
  }

  // The generic env contract may describe an email-unconfigured environment; the
  // governed host candidate gate below is what turns live delivery into a launch
  // requirement before startup.
  assert.equal(validatorRejects({}), false);
});

test("governed candidate preflight requires live email before candidate startup", () => {
  for (const values of [
    {},
    { EMAIL_PROVIDER: "dev" },
    { EMAIL_PROVIDER: "none" },
    { EMAIL_PROVIDER: "mailgun" },
    { EMAIL_PROVIDER: "resend" },
    { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "CHANGE_ME" },
  ]) {
    assert.equal(
      validatorRejects(values, true),
      true,
      `strict candidate gate must reject ${JSON.stringify(values)}`,
    );
  }

  for (const values of [
    { EMAIL_PROVIDER: "resend", RESEND_API_KEY: SUPPLIED },
    { EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: SUPPLIED },
  ]) {
    assert.equal(
      validatorRejects(values, true),
      false,
      `strict candidate gate must accept ${JSON.stringify(values)}`,
    );
  }

  // Strict promotion semantics win even if the shell inherited a non-production
  // NODE_ENV; this guards against a caller accidentally weakening the pre-start gate.
  assert.equal(validatorRejects({ EMAIL_PROVIDER: "dev" }, true, "test"), true);
});

test("generic validator preserves deliberate non-production modes", () => {
  for (const values of [{}, { EMAIL_PROVIDER: "dev" }, { EMAIL_PROVIDER: "none" }]) {
    assert.equal(
      validatorRejects(values, false, "test"),
      false,
      `non-production env:check must preserve ${JSON.stringify(values)}`,
    );
  }
  assert.equal(
    validatorRejects({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "CHANGE_ME" }, false, "development"),
    true,
    "placeholder live credentials remain invalid in every environment",
  );
});

test("non-production readiness distinguishes simulation, disablement and default development", () => {
  assert.deepEqual(
    emailDeliveryReadiness({ NODE_ENV: "development", EMAIL_PROVIDER: "dev" }),
    {
      status: "development",
      provider: "dev",
      mode: "simulated",
      reason: "development_provider",
    },
  );
  assert.deepEqual(
    emailDeliveryReadiness({ NODE_ENV: "test", EMAIL_PROVIDER: "none" }),
    {
      status: "unconfigured",
      provider: "none",
      mode: "disabled",
      reason: "delivery_disabled",
    },
  );
  assert.deepEqual(
    emailDeliveryReadiness({ NODE_ENV: "development" }),
    {
      status: "development",
      provider: "dev",
      mode: "simulated",
      reason: "development_default",
    },
  );
});

test("host promotion binds pre-start and post-start checks to live email readiness", () => {
  const source = readFileSync("scripts/ubuntu24-preflight.sh", "utf8");
  const genericEnvGate = source.indexOf('"$SYSTEMD_NPM_BIN" run env:check');
  const strictEmailGate = source.indexOf("--require-live-email");
  const build = source.indexOf('"$SYSTEMD_NPM_BIN" run build');

  assert.ok(genericEnvGate >= 0, "candidate preflight must run env:check");
  assert.ok(strictEmailGate > genericEnvGate, "strict email gate must follow generic env validation");
  assert.ok(build > strictEmailGate, "strict email gate must run before the production build/start path");
  assert.match(
    source,
    /body\.checks\?\.email !== "configured"/,
    "runtime promotion must explicitly require configured email even if overall health semantics change",
  );
});

test("validator consumes the runtime authority instead of re-implementing provider/key rules", () => {
  const source = readFileSync("scripts/validate-alert-webhook-env.ts", "utf8");
  assert.match(source, /emailDeliveryReadiness/);
  assert.doesNotMatch(source, /RESEND_API_KEY|SENDGRID_API_KEY/);
});
