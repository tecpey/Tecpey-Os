import { loadEnvConfig } from "@next/env";
import { alertWebhookStatus } from "../src/lib/alerts";

// Deliberately reuses the runtime authority rather than re-implementing the rule.
// A validator that decides independently is how a preflight passes on a value the
// process then treats differently.
loadEnvConfig(process.cwd(), false);

const status = alertWebhookStatus(process.env.ALERT_WEBHOOK_URL, "production");
if (status === "misconfigured") {
  console.error(
    "TecPey alert webhook validation failed: ALERT_WEBHOOK_URL is set to a value alerts cannot reach " +
      "(placeholder, malformed, or non-https in production).",
  );
  process.exitCode = 1;
} else {
  console.log(`TecPey alert webhook validation passed (${status}).`);
}
