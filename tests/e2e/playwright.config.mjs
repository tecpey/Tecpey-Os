import { defineConfig } from "@playwright/test";

const baseURL = process.env.TECPEY_E2E_BASE_URL ?? "http://127.0.0.1:3100";
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
});
