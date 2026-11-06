// Tests de punta a punta en los tres motores: Chromium (Chrome, Edge, Opera, Samsung Internet),
// Firefox y WebKit (Safari en macOS e iOS).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' },
  webServer: { command: 'node scripts/serve.mjs 4173', url: 'http://localhost:4173', reuseExistingServer: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
});
