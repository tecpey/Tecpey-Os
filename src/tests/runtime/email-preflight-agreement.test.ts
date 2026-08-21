import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { isEmailConfigured } from "../../lib/email";

// Review finding on #520. The PR gave the placeholder rule one owner, but left the
// email variables outside the preflight's field of view entirely: neither
// RESEND_API_KEY nor SENDGRID_API_KEY appeared in validate-env.mjs. So
// EMAIL_PROVIDER=resend with RESEND_API_KEY=CHANGE_ME cleared the environment gate
// and then reported degraded health and failed every transactional send — the same
// preflight/runtime divergence, one level up.
//
// Unifying the rule is not enough when the two sides disagree about which variables
// the rule applies to. This runs both over one matrix.

const EMAIL_KEYS = ["EMAIL_PROVIDER", "RESEND_API_KEY", "SENDGRID_API_KEY"] as const;
const ORIGINAL = Object.fromEntries(EMAIL_KEYS.map((k) => [k, process.env[k]]));

const SUPPLIED = "unit-test-value";

/** The preflight's email verdict, read from its own output rather than re-derived. */
function preflightRejects(env: Partial<Record<(typeof EMAIL_KEYS)[number], string>>): boolean {
  const child = spawnSync(process.execPath, ["scripts/validate-env.mjs"], {
    encoding: "utf8",
    // Start from a clean slate for the email variables so a developer's own .env
    // cannot decide the result, and keep PATH so node resolves its own imports.
    env: { ...process.env, ...Object.fromEntries(EMAIL_KEYS.map((k) => [k, ""])), ...env },
  });
  const output = `${child.stdout ?? ""}${child.stderr ?? ""}`;
  // Scoped to the email lines on purpose: this environment legitimately fails other
  // required-variable checks, and those must not be read as an email verdict.
  return /EMAIL_PROVIDER|RESEND_API_KEY|SENDGRID_API_KEY/.test(output);
}

function runtimeConfigured(env: Partial<Record<(typeof EMAIL_KEYS)[number], string>>): boolean {
  try {
    for (const key of EMAIL_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(env)) process.env[key] = value;
    return isEmailConfigured();
  } finally {
    for (const key of EMAIL_KEYS) {
      const previous = ORIGINAL[key];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  }
}

// Each row is a deployment someone could actually configure.
const DELIVERING = [
  { EMAIL_PROVIDER: "resend", RESEND_API_KEY: SUPPLIED },
  { EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: SUPPLIED },
  { EMAIL_PROVIDER: " resend ", RESEND_API_KEY: SUPPLIED },
  { EMAIL_PROVIDER: "SendGrid", SENDGRID_API_KEY: SUPPLIED },
  { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "CHANGE_ME" },
  { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "your-real-key-here" },
  { EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: "REPLACE_WITH_KEY" },
  { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "   " },
  { EMAIL_PROVIDER: "resend" },
  { EMAIL_PROVIDER: "sendgrid", RESEND_API_KEY: SUPPLIED },
] as const;

test("the preflight clears exactly the configurations the runtime calls configured", () => {
  // The property, stated once: when a delivering provider is selected, a preflight
  // pass must mean email will actually work. Anything else lets a gate vouch for a
  // path that rejects every message.
  for (const env of DELIVERING) {
    const rejected = preflightRejects(env);
    const configured = runtimeConfigured(env);
    assert.equal(
      rejected,
      !configured,
      `preflight ${rejected ? "rejects" : "accepts"} but runtime reports ${configured ? "configured" : "unconfigured"}: ${JSON.stringify(env)}`,
    );
  }
});

test("dev and none are postures, not misconfigurations", () => {
  // isEmailConfigured() is false for both because neither delivers, but neither is
  // an error: refusing to deploy a staging environment that logs its mail would be
  // the gate lying in the other direction. Same distinction alertWebhookStatus
  // draws between "unconfigured" and "misconfigured".
  for (const provider of ["dev", "none", "DEV", " none "]) {
    assert.equal(
      preflightRejects({ EMAIL_PROVIDER: provider }),
      false,
      `${provider} is a deliberate posture and must not fail the preflight`,
    );
    assert.equal(runtimeConfigured({ EMAIL_PROVIDER: provider }), false);
  }
  assert.equal(preflightRejects({}), false, "an unset provider must not fail the preflight");
});

test("an unknown provider is refused rather than silently ignored", () => {
  // Previously it fell through to dev and mail vanished into the log.
  assert.equal(preflightRejects({ EMAIL_PROVIDER: "mailgun" }), true);
});
