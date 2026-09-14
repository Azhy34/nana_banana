import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suites:
 *   ui   — browser flows with every AI provider mocked. Never spends money.
 *   api  — HTTP contract + security checks. /api routes only exist on Vercel,
 *          so those tests skip against the local preview.
 *   live — free, read-only calls with the real keys from .env.local
 *          (key validity, model availability). No generations.
 *
 * Local run builds the app with every secret env var blanked, so the bundle
 * under test matches what a deploy without baked-in keys would serve.
 * Point at a deployment with E2E_BASE_URL, or use playwright.prod.config.ts.
 */
const LOCAL_PORT = 4173;
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${LOCAL_PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'ui', testDir: './e2e/ui', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'api', testDir: './e2e/api' },
    { name: 'live', testDir: './e2e/live' },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx vite build --outDir .e2e-dist --emptyOutDir && npx vite preview --outDir .e2e-dist --port ${LOCAL_PORT} --strictPort`,
        url: baseURL,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        env: {
          ...(process.env as Record<string, string>),
          // vite.config.ts inlines these into the client bundle; blank them so
          // local keys from .env.local never end up in the build under test.
          GEMINI_API_KEY: '',
          GEMINI_VEO_API_KEY: '',
          OPENROUTER_API_KEY: '',
          REPLICATE_API_TOKEN: '',
          VITE_GEMINI_API_KEY: '',
          VITE_OPENROUTER_API_KEY: '',
          VITE_REPLICATE_API_TOKEN: '',
        },
      },
});
