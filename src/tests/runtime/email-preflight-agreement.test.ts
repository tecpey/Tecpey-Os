import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { emailDeliveryReadiness } from "../../lib/email";

// Review finding on #520: a deployment gate must not accept a delivery posture
// that the runtime later reports as unavailable. The validator imports the same
// runtime authority used by sendEmail()/isEmailConfigured(), and production
// env:check itself refuses every non-delivering posture before candidate start.

const EMAIL_INPUT_KEYS = [
  "EMAIL_PROVIDER",
  "RESEND_API_KEY",
  "SENDGRID_API_KEY",
  "ALERT_WEBHOOK_URL",
] as const;
const SUPPLIED = "unit-test-value";

type EmailValidatorInput = Partial<Record<(typeof EMAIL_INPUT_KEYS)[number], string>>;
type TestNodeEnv = "development" | "production" | "test";

function runValidator(
  values: EmailValidatorInput,
  nodeEnv: TestNodeEnv = "production",
) {
  const childEnv = {
    ...process.env,
    ...Object.fromEntries(EMAIL_INPUT_KEYS.map((key) => [key, ""])),
    ...values,
    NODE_ENV: nodeEnv,
    ALERT_WEBHOOK_URL: "",
  } as NodeJS.ProcessEnv;
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/validate-alert-webhook-env.ts"],
    {
      encoding: "utf8",
      env: childEnv,
    },
  );
}

function validatorRejects(
  values: EmailValidatorInput,
  nodeEnv: TestNodeEnv = "production",
): boolean {
  return runValidator(values, nodeEnv).status !== 0;
}

test("production env gate rejects every non-delivering email posture", () => {
  for (const values of [
    {},
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

test("production env gate accepts only usable live provider credentials", () => {
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
});

test("non-production keeps deliberate dev, none and unset postures without claiming live delivery", () => {
  for (const [environment, values] of [
    ["development", { EMAIL_PROVIDER: "dev" }],
    ["test", { EMAIL_PROVIDER: "none" }],
    ["development", {}],
  ] as const) {
    assert.equal(
      validatorRejects(values, environment),
      false,
      `${environment} validator must preserve deliberate non-delivering posture ${JSON.stringify(values)}`,
    );
  }

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

test("unsupported provider input is redacted at the readiness boundary and in validator output", () => {
  const arbitrary = "credential-accidentally-pasted-as-provider";
  assert.deepEqual(
    emailDeliveryReadiness({ NODE_ENV: "production", EMAIL_PROVIDER: arbitrary }),
    {
      status: "misconfigured",
      provider: "unsupported",
      mode: "blocked",
      reason: "unsupported_provider",
    },
  );

  const child = runValidator({ EMAIL_PROVIDER: arbitrary });
  const output = `${child.stdout ?? ""}${child.stderr ?? ""}`;
  assert.notEqual(child.status, 0);
  assert.doesNotMatch(output, new RegExp(arbitrary));
  assert.match(output, /provider=unsupported/);
});

test("production validator binds email decisions to .env.production rather than inherited shell values", () => {
  const source = readFileSync("scripts/validate-alert-webhook-env.ts", "utf8");
  assert.match(source, /existsSync\(environmentPath\)/);
  assert.match(source, /EMAIL_PROVIDER: file\.EMAIL_PROVIDER/);
  assert.match(source, /RESEND_API_KEY: file\.RESEND_API_KEY/);
  assert.match(source, /SENDGRID_API_KEY: file\.SENDGRID_API_KEY/);
  assert.doesNotMatch(source, /EMAIL_PROVIDER: file\.EMAIL_PROVIDER\s*\?\?/);
  assert.doesNotMatch(source, /RESEND_API_KEY: file\.RESEND_API_KEY\s*\?\?/);
  assert.doesNotMatch(source, /SENDGRID_API_KEY: file\.SENDGRID_API_KEY\s*\?\?/);
});

test("host promotion binds pre-start and post-start readiness to email delivery", () => {
  const preflight = readFileSync("scripts/ubuntu24-preflight.sh", "utf8");
  const healthRoute = readFileSync("src/app/api/health/route.ts", "utf8");
  const envGate = preflight.indexOf('"$SYSTEMD_NPM_BIN" run env:check');
  const build = preflight.indexOf('"$SYSTEMD_NPM_BIN" run build');

  assert.ok(envGate >= 0, "candidate preflight must run production env:check");
  assert.ok(build > envGate, "production env gate must run before build/start");
  assert.match(preflight, /body\.health !== "ok"/);
  assert.match(healthRoute, /email_not_configured: transactional emails will not be delivered/);
  assert.match(
    healthRoute,
    /isProduction && email !== "configured"/,
    "production email must be an HTTP readiness dependency, not a warning-only field",
  );
});

test("validator consumes the runtime authority instead of re-implementing provider decisions", () => {
  const source = readFileSync("scripts/validate-alert-webhook-env.ts", "utf8");
  assert.match(source, /emailDeliveryReadiness\(serviceEnv, serviceEnv\.NODE_ENV\)/);
  assert.doesNotMatch(source, /EMAIL_PROVIDER\s*===/);
  assert.doesNotMatch(source, /\[\s*["']resend["']\s*,\s*["']sendgrid["']/);
});
