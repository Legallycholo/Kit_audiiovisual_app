import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  // Company scenarios start isolated API servers; serial workers prevent
  // route-proxy startup races while keeping each test's database isolated.
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "artifacts/test-results",
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: process.env.KIT_CI_BROWSER === "chromium" ? undefined : "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1050 },
      },
    },
  ],
  webServer: {
    // Tests run without Firebase/reCAPTCHA even when .env enables them.
    command: "VITE_FIREBASE_API_KEY= VITE_RECAPTCHA_SITE_KEY= npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
