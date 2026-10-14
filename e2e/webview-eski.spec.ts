import { expect, test } from "@playwright/test";

// index.html'deki satır içi denetim: eski Android System WebView'de beyaz ekran yerine güncelleme iletisi.
test.describe("eski WebView uyarısı", () => {
  test("güncel motorda uyarı gösterilmez", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByRole("button", { name: "Aç", exact: true })).toBeVisible();
    await expect(page.locator("#oh-webview-eski")).toHaveCount(0);
  });

  test("structuredClone yoksa (Chromium < 98) Play Store bağlantılı uyarı gösterilir", async ({ page }) => {
    await page.addInitScript(() => {
      // Eski WebView benzetimi: uygulamanın gerektirdiği API yok.
      delete (window as { structuredClone?: unknown }).structuredClone;
    });
    await page.goto("./");
    const uyari = page.getByRole("alertdialog", { name: "Android System WebView güncel değil" });
    await expect(uyari).toBeVisible();
    await expect(uyari).toContainText("Play Store'dan");
    await expect(uyari.getByRole("link", { name: "Play Store'da aç" })).toHaveAttribute("href", "https://play.google.com/store/apps/details?id=com.google.android.webview");
    // JavaScript yetersizse "devam et" seçeneği sunulmaz (uygulama zaten açılamaz).
    await expect(uyari.getByRole("button", { name: "Yine de devam et" })).toHaveCount(0);
  });

  test("yalnız CSS eksikse uyarı 'Yine de devam et' ile kapatılır", async ({ page }) => {
    await page.addInitScript(() => {
      const asil = CSS.supports.bind(CSS);
      CSS.supports = ((a: string, b?: string) => (String(b ?? a).includes("color-mix") ? false : b === undefined ? asil(a) : asil(a, b))) as typeof CSS.supports;
    });
    await page.goto("./");
    const uyari = page.getByRole("alertdialog", { name: "Android System WebView güncel değil" });
    await expect(uyari).toBeVisible();
    await uyari.getByRole("button", { name: "Yine de devam et" }).click();
    await expect(uyari).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Aç", exact: true })).toBeVisible();
  });
});
