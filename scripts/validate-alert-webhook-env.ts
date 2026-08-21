import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { alertWebhookStatus } from "../src/lib/alerts";
import { emailDeliveryReadiness, type EmailDeliveryEnvironment } from "../src/lib/email";

// This file is the compatibility entrypoint already pinned by `npm run env:check`
// and the support-bundle rehearsal. Keep that command stable, but make the entrypoint
// validate outbound delivery dependencies from their runtime authorities.
loadEnvConfig(process.cwd(), false);

const VALIDATION_SOURCES = new Set([
  "auto",
  "process",
  "project-production-file",
] as const);
type ValidationSource = "auto" | "process" | "project-production-file";

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

function requestedValidationSource(): ValidationSource | null {
  const configured = process.env.TECPEY_ENV_VALIDATION_SOURCE?.trim();
  const raw = configured || "auto";
  return VALIDATION_SOURCES.has(raw as ValidationSource) ? raw as ValidationSource : null;
}

/**
 * Bind validation to one explicit environment authority.
 *
 * - `process` is used when a governed caller has already loaded the selected
 *   environment source into the child process (for example protected staging's
 *   TECPEY_STAGING_ENV_FILE collector). A local .env.production must not override it.
 * - `project-production-file` is the governed host candidate path and requires the
 *   candidate's own .env.production.
 * - `auto` preserves the generic command: a present .env.production is treated as
 *   a production source; otherwise the already-loaded process environment is used.
 *
 * A .env.production source always has production semantics even if the file omits
 * NODE_ENV or incorrectly says development. The production boundary is selected
 * by the deployment path/file authority, not by an optional value inside that file.
 */
function serviceEnvironment(
  source: ValidationSource,
): (EmailDeliveryEnvironment & { ALERT_WEBHOOK_URL?: string }) | null {
  if (source === "process") return process.env;

  const environmentPath = path.join(process.cwd(), ".env.production");
  if (!existsSync(environmentPath)) {
    return source === "project-production-file" ? null : process.env;
  }

  const file = parseServiceEnvFile(readFileSync(environmentPath, "utf8"));
  return {
    NODE_ENV: "production",
    EMAIL_PROVIDER: file.EMAIL_PROVIDER,
    RESEND_API_KEY: file.RESEND_API_KEY,
    SENDGRID_API_KEY: file.SENDGRID_API_KEY,
    ALERT_WEBHOOK_URL: file.ALERT_WEBHOOK_URL,
  };
}

let failed = false;
const validationSource = requestedValidationSource();
if (!validationSource) {
  console.error(
    "TecPey environment authority validation failed: TECPEY_ENV_VALIDATION_SOURCE is invalid.",
  );
  failed = true;
}

const serviceEnv = validationSource ? serviceEnvironment(validationSource) : null;
if (!serviceEnv) {
  console.error(
    "TecPey environment authority validation failed: selected project production environment file is missing.",
  );
  failed = true;
}

const effectiveEnv: EmailDeliveryEnvironment & { ALERT_WEBHOOK_URL?: string } = serviceEnv ?? {
  NODE_ENV: "production",
};

const alertStatus = alertWebhookStatus(effectiveEnv.ALERT_WEBHOOK_URL, "production");
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
const emailStatus = emailDeliveryReadiness(effectiveEnv, effectiveEnv.NODE_ENV);
const isProduction = (effectiveEnv.NODE_ENV ?? "").trim().toLowerCase() === "production";
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
