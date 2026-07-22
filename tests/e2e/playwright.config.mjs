import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const e2eRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(e2eRoot, "../..");
const port = process.env.TECPEY_E2E_PORT ?? "3100";
const baseURL = process.env.TECPEY_E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const isCi = Boolean(process.env.CI);

const sharedUse = {
  baseURL,
  actionTimeout: 10_000,
  navigationTimeout: 30_000,
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
  video: "retain-on-failure",
};

export default defineConfig({
  testDir: "./specs",
  testMatch: "**/*.spec.mjs",
  outputDir: "./test-results",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: isCi,
  failOnFlakyTests: true,
  retries: 0,
  workers: 1,
  reporter: isCi
    ? [
        ["line"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ]
    : [["list"]],
  use: sharedUse,
  projects: [
    {
      name: "chromium-fa-mobile",
      metadata: { locale: "fa", formFactor: "mobile" },
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
      },
    },
    {
      name: "chromium-en-desktop",
      metadata: { locale: "en", formFactor: "desktop" },
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: "firefox-fa-desktop",
      metadata: { locale: "fa", formFactor: "desktop" },
      use: {
        browserName: "firefox",
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: "firefox-en-mobile",
      metadata: { locale: "en", formFactor: "mobile" },
      use: {
        browserName: "firefox",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    cwd: repositoryRoot,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !isCi,
    stdout: "pipe",
    stderr: "pipe",
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: port,
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_API_URL: baseURL,
      NEXT_PUBLIC_API_BACKEND_URL: baseURL,
      NEXT_PUBLIC_API_SOCKET_URL: `ws://127.0.0.1:${port}`,
      TECPEY_SESSION_SECRET: "e2e-session-secret-32-characters-minimum",
      TECPEY_REFRESH_SECRET: "e2e-refresh-secret-32-characters-minimum",
      TECPEY_ACADEMY_AUTH_SECRET: "e2e-academy-auth-secret-32-characters",
      CERTIFICATE_SIGNING_SECRET: "e2e-certificate-secret-32-characters",
      TECPEY_WITHDRAWAL_PRICE_SECRET: "e2e-withdrawal-price-secret-32-characters",
      TECPEY_OFFLINE_SYNC_SECRET: "e2e-offline-sync-secret-32-characters",
    },
  },
});
