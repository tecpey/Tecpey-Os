import { assertCspConnectionEnvironment } from "../src/lib/security/csp-connection-policy";

try {
  assertCspConnectionEnvironment();
  console.log("TecPey CSP connection environment validation passed.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`TecPey CSP connection environment validation failed: ${message}`);
  process.exitCode = 1;
}
