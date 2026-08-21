import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { alertWebhookStatus } from "../src/lib/alerts";
import { emailDeliveryReadiness, type EmailDeliveryEnvironment } from "../src/lib/email";

// This file is the compatibility entrypoint already pinned by `npm run env:check`
// and the support-bundle rehearsal. Keep that command stable, but make the entrypoint
// validate outbound delivery dependencies from their runtime authorities.
loadEnvConfig(process.cwd(), false);

function parseServiceEnvFile(source: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

/**
 * When the governed candidate contains .env.production, validate the values the
 * service will actually consume rather than an operator shell that happens to
 * export similarly named variables. This closes the inherited-shell escape where
 * a good shell credential could approve a candidate file with no usable email.
 */
function serviceEnvironment(): EmailDeliveryEnvironment & { ALERT_WEBHOOK_URL?: string } {
  const environmentPath = path.join(process.cwd(), ".env.production");
  if (!existsSync(environmentPath)) return process.env;

  const file = parseServiceEnvFile(readFileSync(environmentPath, "utf8"));
  return {
    NODE_ENV: file.NODE_ENV || process.env.NODE_ENV,
    EMAIL_PROVIDER: file.EMAIL_PROVIDER,
    RESEND_API_KEY: file.RESEND_API_KEY,
    SENDGRID_API_KEY: file.SENDGRID_API_KEY,
    ALERT_WEBHOOK_URL: file.ALERT_WEBHOOK_URL,
  };
}

const serviceEnv = serviceEnvironment();
let failed = false;

const alertStatus = alertWebhookStatus(serviceEnv.ALERT_WEBHOOK_URL, "production");
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
const emailStatus = emailDeliveryReadiness(serviceEnv, serviceEnv.NODE_ENV);
const isProduction = (serviceEnv.NODE_ENV ?? "").trim().toLowerCase() === "production";
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
