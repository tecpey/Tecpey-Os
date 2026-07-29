import { configureProductionConnectionUrls } from "../src/lib/production-connection-env";

configureProductionConnectionUrls();

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
