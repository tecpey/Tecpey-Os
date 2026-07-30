import { loadEnvConfig } from "@next/env";
import { assertCspConnectionEnvironment } from "../src/lib/security/csp-connection-policy";

try {
  if (!Reflect.set(process.env, "NODE_ENV", "production")) {
    throw new Error("production_csp_node_env_unavailable");
  }
  loadEnvConfig(process.cwd(), false);
  assertCspConnectionEnvironment();
  console.log("TecPey CSP connection environment validation passed.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`TecPey CSP connection environment validation failed: ${message}`);
  process.exitCode = 1;
}
