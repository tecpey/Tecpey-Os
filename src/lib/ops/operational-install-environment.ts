import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { parseSystemdEnvironmentFile } from "@/lib/ops/systemd-environment-file";

const MAX_ENV_FILE_BYTES = 64 * 1024;

export type OperationalInstallEnvironmentSummary = Readonly<{
  databaseConfigured: true;
  alertWebhookConfigured: true;
  bearerConfigured: boolean;
}>;

function safeAbsoluteFile(value: string): string {
  if (
    typeof value !== "string" ||
    value.length < 2 ||
    value.length > 500 ||
    value.includes("\0") ||
    !path.isAbsolute(value)
  ) {
    throw new Error("operational_install_environment_file_invalid");
  }
  const normalized = path.normalize(value);
  if (normalized === path.parse(normalized).root) {
    throw new Error("operational_install_environment_file_invalid");
  }
  return normalized;
}

function requiredValue(values: Map<string, string>, name: string): string {
  const value = values.get(name)?.trim() ?? "";
  if (!value) {
    throw new Error(`operational_install_${name.toLowerCase()}_missing`);
  }
  if (
    value.includes("CHANGE_ME") ||
    value.includes("example.invalid") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`operational_install_${name.toLowerCase()}_invalid`);
  }
  return value;
}

function validateDatabaseUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("operational_install_database_url_invalid");
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !parsed.hostname ||
    !parsed.pathname ||
    parsed.pathname === "/" ||
    parsed.hash
  ) {
    throw new Error("operational_install_database_url_invalid");
  }
}

function validateWebhook(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("operational_install_webhook_invalid");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    !host ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost")
  ) {
    throw new Error("operational_install_webhook_invalid");
  }
}

function validateBearer(value: string | undefined): boolean {
  if (value === undefined || value === "") return false;
  if (
    value.length > 2_000 ||
    /[\r\n\u0000]/.test(value)
  ) {
    throw new Error("operational_install_bearer_invalid");
  }
  return true;
}

export async function validateOperationalInstallEnvironmentFile(
  filePath: string,
): Promise<OperationalInstallEnvironmentSummary> {
  const normalized = safeAbsoluteFile(filePath);
  const stat = await lstat(normalized);
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    stat.size < 1 ||
    stat.size > MAX_ENV_FILE_BYTES ||
    (stat.mode & 0o007) !== 0 ||
    (stat.mode & 0o030) !== 0
  ) {
    throw new Error("operational_install_environment_file_unsafe");
  }

  const values = parseSystemdEnvironmentFile(
    await readFile(normalized, "utf8"),
    { rejectDuplicateKeys: true },
  );
  const databaseUrl = requiredValue(values, "DATABASE_URL");
  const webhook = requiredValue(values, "TECPEY_OPS_ALERT_WEBHOOK_URL");
  validateDatabaseUrl(databaseUrl);
  validateWebhook(webhook);
  const bearerConfigured = validateBearer(
    values.get("TECPEY_OPS_ALERT_BEARER_TOKEN"),
  );

  return Object.freeze({
    databaseConfigured: true,
    alertWebhookConfigured: true,
    bearerConfigured,
  });
}
