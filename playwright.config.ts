import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de extremo a extremo. Requieren Supabase local en marcha
 * (`npm run db:start`).
 *
 * Se ejecutan contra el BUILD DE PRODUCCIÓN (next build + next start) en el
 * puerto 3100, porque es donde se aplica la CSP estricta real; así no chocan
 * con `npm run dev` (puerto 3000). Con E2E_DEV=1 usan el servidor de desarrollo.
 */
const PORT = 3100;
const useDev = process.env.E2E_DEV === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-ES",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: useDev ? `npx next dev -p ${PORT}` : `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
