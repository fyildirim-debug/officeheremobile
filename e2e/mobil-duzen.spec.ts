// Mobil yerleşim düzeltmeleri: dar üst çubukta kayıt durumu kesilmez, çiplerin dokunma alanı 44 px,
// klavye açıkken not yazarken slayt görünür kalır, ızgaradan dokunmayla açılan panel aynı dokunuşla
// kapanmaz, Tablo'da Türkçe bul (i↔İ) ve değiştir.
import { expect, test, type Page } from "@playwright/test";
import { fixture, newDoc, openFile, start } from "./ortak";

/** Ekran klavyesi: görünür alan alçalır (Android adjustResize). */
async function klavye(page: Page, ac: boolean) {
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.width, height: ac ? Math.round(vp.height * 0.55) : Math.round(vp.height / 0.55) });
}

test("üst çubuk: düğmeler çokken uygulama adı düşer, kayıt durumu kesilmez @koyu", async ({ page }) => {
  await start(page);
  await newDoc(page, "belge");
  await page.locator(".bl-body .ProseMirror").click();
  await page.keyboard.type("Deneme");
  await page.getByRole("button", { name: "Düzenlemeyi bitir" }).click();
  // Görüntüleme kipinde 5 düğme: Mobil görünüm, Bul, Kaydet, Düzenle, Daha fazla
  await expect(page.locator(".m-appbar-actions button")).toHaveCount(5);
  const alt = page.locator(".m-appbar-sub");
  await expect(alt).toContainText("Kaydedilmedi");
  const olcu = await alt.evaluate((el) => ({ sigar: el.scrollWidth <= el.clientWidth + 1, uygulama: getComputedStyle(el.querySelector(".m-appbar-sub-app")!).display }));
  expect(olcu).toEqual({ sigar: true, uygulama: "none" });
  // Geniş başlıkta (düzenleme kipi, 4 düğme) uygulama adı görünür
  await page.getByRole("button", { name: "Düzenle" }).click();
  await expect(page.locator(".m-appbar-sub-app")).toBeVisible();
});

test("çiplerin dokunma alanı 44 px", async ({ page }) => {
  await start(page);
  const cip = page.getByRole("tab", { name: "Tablo" });
  const k = (await cip.boundingBox())!;
  expect(k.height).toBeLessThan(44);
  // Görünen kenarın 4 px üstüne ve altına dokunma da çipe gider
  for (const y of [k.y - 4, k.y + k.height + 4]) {
    const hedef = await page.evaluate(([x, yy]) => document.elementFromPoint(x, yy)?.closest(".m-chip")?.textContent ?? null, [k.x + k.width / 2, y]);
    expect(hedef).toBe("Tablo");
  }
});

test("klavye açıkken not yazarken küçük resimler ve biçim araçları gizlenir", async ({ page }) => {
  await start(page);
  await openFile(page, fixture("sunum", "lo-proje.pptx"));
  await expect(page.locator(".m-sunum-kagit")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Düzenle" }).click();
  await page.getByText("Not eklemek için dokunun").click();
  await page.getByLabel("Slayt notları").click();
  await klavye(page, true);
  await expect(page.locator(".m-sunum-seri")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Düzenleme araçları" })).toBeHidden();
  const slayt = (await page.locator(".m-sunum-kagit").first().boundingBox())!;
  expect(slayt.height).toBeGreaterThan(120);
  await page.keyboard.type("Açılışta teşekkür et.");
  await klavye(page, false);
  await page.getByLabel("Slayt notları").blur();
  await expect(page.locator(".m-sunum-seri")).toBeVisible();
});

test("Tablo: Türkçe bul (izmir → İzmir) ve değiştir, geri alınır", async ({ page }) => {
  await start(page);
  await newDoc(page, "tablo");
  await expect(page.locator(".m-tablo-grid")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Formül çubuğu", { exact: true }).click();
  for (const v of ["İzmir", "Ankara", "IĞDIR", "izmir körfezi"]) {
    await page.keyboard.type(v);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Daha fazla" }).click();
  await page.getByRole("button", { name: "Bul", exact: true }).click();
  await page.getByLabel("Bul", { exact: true }).fill("izmir");
  await expect(page.locator(".m-tablo-find-count")).toHaveText("1/2");
  await page.getByLabel("Bul", { exact: true }).fill("ığdır");
  await expect(page.locator(".m-tablo-find-count")).toHaveText("1/1");
  await page.getByLabel("Bul", { exact: true }).fill("izmir");
  await page.getByRole("button", { name: "Değiştir", exact: true }).click();
  await page.getByLabel("Yeni metin").fill("Manisa");
  await page.getByRole("button", { name: "Tümü", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 hücrede değiştirildi." })).toBeVisible();
  await expect(page.locator(".m-tablo-find-count")).toHaveText("Sonuç yok");
  await page.getByRole("button", { name: "Bulu kapat" }).click();
  await page.getByLabel("Ad Kutusu", { exact: true }).fill("A4");
  await page.getByLabel("Ad Kutusu", { exact: true }).press("Enter");
  await expect(page.getByRole("status", { name: "Hücre bilgisi" })).toHaveText("A4: Manisa körfezi");
  await page.getByRole("button", { name: "Geri al" }).click();
  await expect(page.getByRole("status", { name: "Hücre bilgisi" })).toHaveText("A4: izmir körfezi");
});
