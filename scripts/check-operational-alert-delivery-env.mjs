import path from "node:path";

function required(name) {
  const value = process.env[name]?.trim() ?? "";
  if (!value || value.includes("CHANGE_ME")) {
    throw new Error(`${name.toLowerCase()}_required`);
  }
  return value;
}

function absoluteDirectory(name) {
  const value = required(name);
  const normalized = path.normalize(value);
  if (
    !path.isAbsolute(value) ||
    normalized === path.parse(normalized).root ||
    value.length > 500 ||
    value.includes("\0")
  ) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return normalized;
}

function boundedIntegerEnv(name, fallback, minimum, maximum) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return parsed;
}

function webhookOrigin() {
  const value = required("TECPEY_OPS_ALERT_WEBHOOK_URL");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("tecpey_ops_alert_webhook_url_invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    value.length > 2_048
  ) {
    throw new Error("tecpey_ops_alert_webhook_url_invalid");
  }
  return parsed.origin;
}

function bearerToken() {
  const value = process.env.TECPEY_OPS_ALERT_BEARER_TOKEN;
  if (value && (value.length > 2_000 || /[\r\n\u0000]/.test(value))) {
    throw new Error("tecpey_ops_alert_bearer_token_invalid");
  }
}

try {
  const stateDirectory = absoluteDirectory("TECPEY_OPS_STATE_DIR");
  const alertOrigin = webhookOrigin();
  bearerToken();
  boundedIntegerEnv("TECPEY_OPS_ALERT_BATCH_SIZE", 20, 1, 100);
  boundedIntegerEnv("TECPEY_OPS_ALERT_TIMEOUT_MS", 10_000, 1_000, 30_000);
  boundedIntegerEnv("TECPEY_OPS_ALERT_MAX_ATTEMPTS", 10, 1, 100);
  console.log(JSON.stringify({
    ok: true,
    authority: "operational-alert-delivery",
    stateDirectory,
    alertOrigin,
  }));
} catch (error) {
  const code =
    error instanceof Error && /^[a-z0-9._:-]{3,120}$/.test(error.message)
      ? error.message
      : "operational_alert_delivery_environment_invalid";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
}
