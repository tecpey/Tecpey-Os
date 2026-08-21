import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
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
const VALIDATOR_PATH = resolve("scripts/validate-alert-webhook-env.ts");
const NODE_MODULES_PATH = resolve("node_modules");

type EmailValidatorInput = Partial<Record<(typeof EMAIL_INPUT_KEYS)[number], string>>;
type TestNodeEnv = "development" | "production" | "test";
type ValidatorRunOptions = {
  cwd?: string;
  validationSource?: "auto" | "process" | "project-production-file";
};

function runValidator(
  values: EmailValidatorInput,
  nodeEnv: TestNodeEnv = "production",
  options: ValidatorRunOptions = {},
) {
  const childEnv = {
    ...process.env,
    ...Object.fromEntries(EMAIL_INPUT_KEYS.map((key) => [key, ""])),
    ...values,
    NODE_ENV: nodeEnv,
    ALERT_WEBHOOK_URL: "",
    TECPEY_ENV_VALIDATION_SOURCE: options.validationSource ?? "",
  } as NodeJS.ProcessEnv;
  return spawnSync(
    process.execPath,
    ["--import", "tsx", VALIDATOR_PATH],
    {
      cwd: options.cwd ?? process.cwd(),
      encoding: "utf8",
      env: childEnv,
    },
  );
}

function validatorRejects(
  values: EmailValidatorInput,
  nodeEnv: TestNodeEnv = "production",
  options: ValidatorRunOptions = {},
): boolean {
  return runValidator(values, nodeEnv, options).status !== 0;
}

function tempProject(t: TestContext, productionEnv: string): string {
  const root = mkdtempSync(join(tmpdir(), "tecpey-email-env-authority-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  symlinkSync(NODE_MODULES_PATH, join(root, "node_modules"), "dir");
  writeFileSync(join(root, ".env.production"), productionEnv, "utf8");
  return root;
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

test("candidate file authority forces production and cannot be rescued by inherited shell credentials", (t) => {
  const root = tempProject(
    t,
    [
      "NODE_ENV=development",
      "EMAIL_PROVIDER=none",
      "",
    ].join("\n"),
  );
  const child = runValidator(
    { EMAIL_PROVIDER: "resend", RESEND_API_KEY: SUPPLIED },
    "development",
    { cwd: root, validationSource: "project-production-file" },
  );
  const output = `${child.stdout ?? ""}${child.stderr ?? ""}`;
  assert.notEqual(child.status, 0, "candidate .env.production must be judged with production semantics");
  assert.match(output, /disabled_provider_forbidden_in_production/);
});

test("explicit process authority wins over an unrelated local .env.production", async (t) => {
  await t.test("selected protected env is rejected even when local file is live", (subtest) => {
    const root = tempProject(
      subtest,
      [
        "NODE_ENV=production",
        "EMAIL_PROVIDER=resend",
        `RESEND_API_KEY=${SUPPLIED}`,
        "",
      ].join("\n"),
    );
    const child = runValidator(
      { EMAIL_PROVIDER: "none" },
      "production",
      { cwd: root, validationSource: "process" },
    );
    assert.notEqual(child.status, 0);
  });

  await t.test("selected protected env is accepted even when local file is stale", (subtest) => {
    const root = tempProject(
      subtest,
      [
        "NODE_ENV=production",
        "EMAIL_PROVIDER=none",
        "",
      ].join("\n"),
    );
    const child = runValidator(
      { EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: SUPPLIED },
      "production",
      { cwd: root, validationSource: "process" },
    );
    assert.equal(child.status, 0, child.stderr);
  });
});

test("governed callers pin production and staging source authority before env:check", () => {
  const preflight = readFileSync("scripts/ubuntu24-preflight.sh", "utf8");
  const collector = readFileSync("scripts/collect-protected-staging-env-evidence.mjs", "utf8");
  const envGate = preflight.indexOf('"$SYSTEMD_NPM_BIN" run env:check');
  const productionBinding = preflight.indexOf(
    "NODE_ENV=production TECPEY_ENV_VALIDATION_SOURCE=project-production-file",
  );
  const parsedValues = collector.indexOf("...parsed.values");
  const stagingBinding = collector.indexOf('TECPEY_ENV_VALIDATION_SOURCE: "process"');

  assert.ok(productionBinding >= 0 && productionBinding < envGate);
  assert.ok(parsedValues >= 0 && stagingBinding > parsedValues);
  assert.match(collector, /NODE_ENV: "production"/);
});

test("host promotion binds pre-start and post-start readiness to email delivery", () => {
  const preflight = readFileSync("scripts/ubuntu24-preflight.sh", "utf8");
  const healthRoute = readFileSync("src/app/api/health/route.ts", "utf8");
  const envGate = preflight.indexOf('"$SYSTEMD_NPM_BIN" run env:check');
  const build = preflight.indexOf('"$SYSTEMD_NPM_BIN" run build');

  assert.ok(envGate >= 0, "candidate preflight must run production env:check");
  assert.ok(build > envGate, "production env gate must run before build/start");
  assert.match(preflight, /body\.health !== "ok"/);
  assert.match(preflight, /body\.checks\?\.email !== "configured"/);
  assert.match(healthRoute, /email_not_configured: transactional emails will not be delivered/);
  assert.match(
    healthRoute,
    /isProduction && email !== "configured"/,
    "production email must be an HTTP readiness dependency, not a warning-only field",
  );
});

test("validator consumes the runtime authority instead of re-implementing provider decisions", () => {
  const source = readFileSync("scripts/validate-alert-webhook-env.ts", "utf8");
  assert.match(source, /emailDeliveryReadiness\(effectiveEnv, effectiveEnv\.NODE_ENV\)/);
  assert.doesNotMatch(source, /EMAIL_PROVIDER\s*===/);
  assert.doesNotMatch(source, /\[\s*["']resend["']\s*,\s*["']sendgrid["']/);
});
