import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export const PROD_URL = 'https://nanabanana-one.vercel.app';

// Same suites against production. UI tests still mock every AI provider;
// API tests only send requests that fail validation before any paid call.
export default defineConfig({
  ...base,
  workers: 2,
  webServer: undefined,
  use: { ...base.use, baseURL: process.env.E2E_BASE_URL || PROD_URL },
});
