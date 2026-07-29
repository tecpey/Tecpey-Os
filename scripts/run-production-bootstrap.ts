import { loadEnvConfig } from "@next/env";
import { configureProductionConnectionUrls } from "../src/lib/production-connection-env";
import { assertCspConnectionEnvironment } from "../src/lib/security/csp-connection-policy";

loadEnvConfig(process.cwd(), false);
configureProductionConnectionUrls();
assertCspConnectionEnvironment();

async function main(): Promise<void> {
  if (process.argv[2] === "migrate") {
    await import("./run-database-migrations");
  } else if (process.argv[2] === undefined || process.argv[2] === "server") {
    await import("../server");
  } else {
    throw new Error(`unsupported_production_bootstrap_target:${process.argv[2]}`);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[production-bootstrap] ${message}`);
  process.exitCode = 1;
});
