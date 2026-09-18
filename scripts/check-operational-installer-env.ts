import { validateOperationalInstallEnvironmentFile } from "../src/lib/ops/operational-install-environment";

async function main(): Promise<void> {
  const filePath = process.env.TECPEY_INSTALL_ENV_FILE?.trim() ?? "";
  if (!filePath) {
    throw new Error("operational_install_environment_file_required");
  }
  const summary = await validateOperationalInstallEnvironmentFile(filePath);
  console.log(JSON.stringify({ ok: true, ...summary }));
}

void main().catch((error) => {
  const code =
    error instanceof Error && /^[a-z0-9._:-]{3,160}$/.test(error.message)
      ? error.message
      : "operational_install_environment_invalid";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
