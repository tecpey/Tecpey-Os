import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { alertWebhookStatus, assertAlertWebhookUsable } from "../../lib/alerts";

// /api/health reported alertWebhook purely on the variable being non-empty, and
// deliverWebhook only checked the same thing. So ALERT_WEBHOOK_URL set to a
// placeholder produced a POST that failed into a logger.warn while health told the
// deployment contract the webhook was configured. R-04 makes alert delivery a
// precondition for any Go record, so that claim is load-bearing.
//
// Same shape as the error-tracking defect: a signal reporting a capability rather
// than providing it. The rule lives in one authority here precisely because the
// last fix of this kind broke by having a validator and a runtime disagree.

test("an absent webhook is unconfigured, not misconfigured", () => {
  // A known posture, not a false belief — the two must stay distinguishable.
  assert.equal(alertWebhookStatus(undefined, "production"), "unconfigured");
  assert.equal(alertWebhookStatus("", "production"), "unconfigured");
  assert.equal(alertWebhookStatus("   ", "production"), "unconfigured");
});

test("a real https endpoint is configured", () => {
  assert.equal(alertWebhookStatus("https://hooks.example.org/t/abc", "production"), "configured");
});

test("placeholders are refused rather than reported as configured", () => {
  for (const url of [
    "https://CHANGE_ME.tecpey.ir/hook",
    "https://hooks.example.com/replace",
    "https://your-real-webhook.test/hook",
    "https://REPLACE_WITH_REAL/hook",
  ]) {
    assert.equal(
      alertWebhookStatus(url, "production"),
      "misconfigured",
      `${url} must not be reported as configured`,
    );
  }
});

test("a malformed or non-web URL is refused", () => {
  for (const url of ["not-a-url", "ftp://alerts.tecpey.ir/hook", "javascript:alert(1)"]) {
    assert.equal(alertWebhookStatus(url, "production"), "misconfigured", url);
  }
});

test("plain http is refused in production but allowed locally", () => {
  // Alert bodies name failing subsystems, so production must not put them on the
  // wire in clear text. Local development legitimately uses http listeners.
  assert.equal(alertWebhookStatus("http://alerts.internal/hook", "production"), "misconfigured");
  assert.equal(alertWebhookStatus("http://localhost:9000/hook", "development"), "configured");
});

test("the assertion throws only for an unusable value", () => {
  const previous = process.env.ALERT_WEBHOOK_URL;
  try {
    process.env.ALERT_WEBHOOK_URL = "https://CHANGE_ME/hook";
    assert.throws(() => assertAlertWebhookUsable(), /alert_webhook_url_unusable/);
    // Both a real endpoint and no endpoint at all are legitimate configurations.
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.org/t/abc";
    assertAlertWebhookUsable();
    delete process.env.ALERT_WEBHOOK_URL;
    assertAlertWebhookUsable();
  } finally {
    if (previous === undefined) delete process.env.ALERT_WEBHOOK_URL;
    else process.env.ALERT_WEBHOOK_URL = previous;
  }
});

test("every consumer reads the one authority instead of re-deciding", () => {
  // The previous fix of this kind regressed because a validator trimmed and the
  // runtime did not. Whoever answers "is this configured" must be the same code.
  const health = readFileSync("src/app/api/health/route.ts", "utf8");
  assert.match(health, /alertWebhook: alertWebhookStatus\(\)/);
  assert.ok(
    !health.includes("process.env.ALERT_WEBHOOK_URL"),
    "health must not re-derive the webhook decision from the raw variable",
  );

  const alerts = readFileSync("src/lib/alerts.ts", "utf8");
  assert.match(
    alerts,
    /const status = alertWebhookStatus\(url\)/,
    "delivery must consult the same authority it exports",
  );

  const validator = readFileSync("scripts/validate-alert-webhook-env.ts", "utf8");
  assert.match(validator, /import \{ alertWebhookStatus \} from "\.\.\/src\/lib\/alerts"/);
});

// The env:check pin used to be checked here, added when extending that command
// nearly broke every support bundle. It guarded one of the rehearsal's seven pins
// and left six unwatched — the instance, not the class. The check now lives in
// scripts/support-install-readiness-policy.mjs, which already receives both
// package.json and the rehearsal and covers the whole table. Keeping a private
// copy of one row here is the duplication those checks exist to prevent.
