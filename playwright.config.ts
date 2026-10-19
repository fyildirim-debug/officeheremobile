import { defineConfig, devices } from "@playwright/test";

// Uçtan uca testler telefon ekranında (Pixel 7, dokunmatik) geliştirme sunucusu üzerinde çalışır.
// OH_E2E_PORT ile port değiştirilebilir (paralel çalışan kopyalar çakışmasın).
const port = Number(process.env.OH_E2E_PORT ?? 5190);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Pixel 7"],
    baseURL: `http://localhost:${port}/`,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    acceptDownloads: true,
    // Pano izni açıkça verilir: izin sorusu başsız tarayıcıda yanıtsız kalınca Yapıştır beklemede kalıyordu
    // (Playwright sürümüne göre okuma hemen reddediliyor ya da bekliyor). Kullanıcı izni onaylamış gibi.
    permissions: ["clipboard-read", "clipboard-write"],
    // OH_CHROMIUM: Playwright'ın kendi tarayıcısı kurulamayan ortamda (ör. bulut oturumu) yerel Chromium
    ...(process.env.OH_CHROMIUM ? { launchOptions: { executablePath: process.env.OH_CHROMIUM } } : {}),
  },
  projects: [
    { name: "acik", use: { colorScheme: "light" } },
    { name: "koyu", use: { colorScheme: "dark" }, grep: /@koyu/ },
  ],
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
