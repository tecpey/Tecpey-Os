import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const externalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./src/tests/browser",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "firefox-desktop",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "firefox-mobile",
      use: { ...devices["Desktop Firefox"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: externalServer
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          PORT: "3100",
          NODE_ENV: "production",
          NEXT_PUBLIC_SITE_URL: baseURL,
          NEXT_PUBLIC_API_URL: "https://my.tecpey.ir",
          NEXT_PUBLIC_API_BACKEND_URL: "https://ci-placeholder.tecpey.ir",
          NEXT_PUBLIC_API_SOCKET_URL: "wss://ci-placeholder.tecpey.ir/spot",
          NEXT_PUBLIC_EXTRA_CONNECT_SRC: "",
          REDIS_URL: "",
        },
      },
});
