import { loadEnvConfig } from "@next/env";
import { alertWebhookStatus } from "../src/lib/alerts";
import { emailDeliveryReadiness } from "../src/lib/email";

// This file is the compatibility entrypoint already pinned by `npm run env:check`
// and the support-bundle rehearsal. Keep that command stable, but make the entrypoint
// validate both outbound delivery dependencies from their runtime authorities so
// preflight and runtime cannot drift independently.
loadEnvConfig(process.cwd(), false);

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

// Production env:check is itself the pre-start launch boundary. It must never
// approve a candidate whose runtime will report transactional email unavailable.
// Non-production keeps deliberate dev/none/unset postures for local/test use.
const emailStatus = emailDeliveryReadiness(process.env, process.env.NODE_ENV);
const isProduction = (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
const emailMustFail =
  emailStatus.status === "misconfigured" ||
  (isProduction && emailStatus.status !== "configured");

if (emailMustFail) {
  console.error(
    `TecPey email delivery validation failed: status=${emailStatus.status}; ` +
      `provider=${emailStatus.provider ?? "unset"}; reason=${emailStatus.reason ?? "none"}. ` +
      "Production requires resend or sendgrid with a usable non-placeholder credential.",
  );
  failed = true;
} else {
  console.log(
    `TecPey email delivery validation passed (${emailStatus.status}; provider=${emailStatus.provider ?? "unset"}).`,
  );
}

if (failed) process.exitCode = 1;
