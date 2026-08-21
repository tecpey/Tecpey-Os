import { loadEnvConfig } from "@next/env";
import { alertWebhookStatus } from "../src/lib/alerts";
import { emailDeliveryReadiness } from "../src/lib/email";

// This file is the compatibility entrypoint already pinned by `npm run env:check`
// and the support-bundle rehearsal. Keep that command stable, but make the entrypoint
// validate both outbound delivery dependencies from their runtime authorities so
// preflight and runtime cannot drift independently.
loadEnvConfig(process.cwd(), false);

const requireLiveEmail = process.argv.includes("--require-live-email");
let failed = false;

const alertStatus = alertWebhookStatus(process.env.ALERT_WEBHOOK_URL, "production");
if (alertStatus === "misconfigured") {
  console.error(
    "TecPey alert webhook validation failed: ALERT_WEBHOOK_URL is set to a value alerts cannot reach " +
      "(placeholder, malformed, or non-https in production).",
  );
  failed = true;
} else {
  console.log(`TecPey alert webhook validation passed (${alertStatus}).`);
}

const emailStatus = emailDeliveryReadiness(process.env, "production");
const emailMustFail =
  emailStatus.status === "misconfigured" ||
  (requireLiveEmail && emailStatus.status !== "configured");

if (emailMustFail) {
  console.error(
    `TecPey email delivery validation failed: status=${emailStatus.status}; ` +
      `provider=${emailStatus.provider ?? "unset"}; reason=${emailStatus.reason ?? "none"}. ` +
      "Production promotion requires resend or sendgrid with a usable non-placeholder credential.",
  );
  failed = true;
} else {
  console.log(
    `TecPey email delivery validation passed (${emailStatus.status}; provider=${emailStatus.provider ?? "unset"}).`,
  );
}

if (failed) process.exitCode = 1;
