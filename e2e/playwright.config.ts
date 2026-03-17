import { defineConfig, devices } from '@playwright/test'

/**
 * E2E configuration for push notification tests.
 *
 * Expects:
 *   - Frontend dev server at http://localhost:5173 (started by webServer config below)
 *   - Backend API at http://localhost:8000 (started separately; see GitHub workflow)
 *
 * Env vars consumed:
 *   - BASE_URL   override front-end origin (default: http://localhost:5173)
 *   - E2E_EMAIL  login email for the test account
 *   - E2E_PW     login password for the test account
 */
export default defineConfig({
    testDir: '.',
    timeout: 60_000,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',

    use: {
        baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
        // Grant notification permission so the browser doesn't block the prompt
        permissions: ['notifications'],
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    // Start the Vite dev server automatically when running locally.
    // In CI the server is started by the workflow before Playwright runs.
    webServer: process.env.CI
        ? undefined
        : {
              command: 'npm run dev',
              cwd: '../frontend',
              url: 'http://localhost:5173',
              reuseExistingServer: true,
          },
})
