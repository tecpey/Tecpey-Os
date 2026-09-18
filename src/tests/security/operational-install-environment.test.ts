import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { validateOperationalInstallEnvironmentFile } from "@/lib/ops/operational-install-environment";

async function withEnvironmentFile(
  content: string,
  callback: (filePath: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecpey-ops-install-env-"));
  const filePath = path.join(root, "runtime.env");
  try {
    await writeFile(filePath, content, { encoding: "utf8", mode: 0o640 });
    await chmod(filePath, 0o640);
    await callback(filePath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("operational installer environment authority", () => {
  it("accepts governed quoted values with internal spaces without exposing them", async () => {
    await withEnvironmentFile(
      [
        "DATABASE_URL='postgresql://tecpey:secret@db.internal/tecpey'",
        "TECPEY_OPS_ALERT_WEBHOOK_URL=\"https://alerts.example.test/hooks/ops\"",
        "LIMOO_SMS_OTP_COPY='تک‌پی؛ رمز ورود شما: {0}'",
        "",
      ].join("\n"),
      async (filePath) => {
        const result = await validateOperationalInstallEnvironmentFile(filePath);
        assert.deepEqual(result, {
          databaseConfigured: true,
          alertWebhookConfigured: true,
          bearerConfigured: false,
        });
        assert.doesNotMatch(JSON.stringify(result), /secret|رمز|hooks\/ops/);
      },
    );
  });

  it("fails closed on duplicate authority keys", async () => {
    await withEnvironmentFile(
      [
        "DATABASE_URL=postgresql://tecpey:first@db.internal/tecpey",
        "DATABASE_URL=postgresql://tecpey:second@db.internal/tecpey",
        "TECPEY_OPS_ALERT_WEBHOOK_URL=https://alerts.example.test/hooks/ops",
        "",
      ].join("\n"),
      async (filePath) => {
        await assert.rejects(
          validateOperationalInstallEnvironmentFile(filePath),
          /systemd_environment_file_duplicate_key/,
        );
      },
    );
  });

  it("rejects non-HTTPS delivery endpoints and writeable authority files", async () => {
    await withEnvironmentFile(
      [
        "DATABASE_URL=postgresql://tecpey:secret@db.internal/tecpey",
        "TECPEY_OPS_ALERT_WEBHOOK_URL=http://alerts.example.test/hooks/ops",
        "",
      ].join("\n"),
      async (filePath) => {
        await assert.rejects(
          validateOperationalInstallEnvironmentFile(filePath),
          /operational_install_webhook_invalid/,
        );
        await chmod(filePath, 0o666);
        await assert.rejects(
          validateOperationalInstallEnvironmentFile(filePath),
          /operational_install_environment_file_unsafe/,
        );
      },
    );
  });
});
