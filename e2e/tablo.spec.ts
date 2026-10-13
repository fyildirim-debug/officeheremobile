// Tablo ekranı uçtan uca testleri (Pixel 7, dokunmatik). Izgara tuval olduğundan doğrulama
// formül çubuğu, Ad Kutusu ve erişilebilir durum metni ("Hücre bilgisi") ile yapılır.
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { download, fixture, newDoc, openFile, start } from "./ortak";

const GRAFIKLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/tablo/grafikli.xlsx");

const status = (page: Page) => page.getByRole("status", { name: "Hücre bilgisi" });
const formulaBar = (page: Page) => page.getByLabel("Formül çubuğu", { exact: true });
const nameBox = (page: Page) => page.getByLabel("Ad Kutusu", { exact: true });
const grid = (page: Page) => page.locator(".m-tablo-grid");

async function ready(page: Page) {
  await expect(grid(page)).toBeVisible({ timeout: 30_000 });
}

/** Ad Kutusu ile hücreye/aralığa git. */
async function goTo(page: Page, ref: string) {
  await nameBox(page).fill(ref);
  await nameBox(page).press("Enter");
}

/** Varsayılan boyutlu hücreye (%100: sütun 64, satır 20 px) parmakla dokunur. */
async function tapCell(page: Page, col: number, row: number) {
  const box = (await grid(page).boundingBox())!;
  const headerW = 32;
  await page.touchscreen.tap(box.x + headerW + col * 64 + 30, box.y + 20 + row * 20 + 10);
}

/** Formül çubuğuna yazıp Enter'a basar (Enter aşağı geçer). */
async function enter(page: Page, ...values: string[]) {
  await formulaBar(page).click();
  for (const v of values) {
    await page.keyboard.type(v);
    await page.keyboard.press("Enter");
  }
}

test("yeni tablo: değer ve formül girişi, seçim bilgisi, kaydet ve yeniden aç", async ({ page }) => {
  await start(page);
  await newDoc(page, "tablo");
  await ready(page);
  // Yeni tablo doğrudan düzenleme kipinde, boş Sayfa1
  await expect(page.getByRole("button", { name: "Geri al" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Sayfa1" })).toHaveAttribute("aria-selected", "true");
  await expect(status(page)).toHaveText("A1");

  await enter(page, "5", "7", "=TOPLA(A1:A2)");
  await expect(nameBox(page)).toHaveValue("A4");
  await tapCell(page, 0, 2);
  await expect(status(page)).toHaveText("A3: 12");
  await expect(formulaBar(page)).toHaveValue("=TOPLA(A1:A2)");
  await expect(page.locator(".m-appbar-sub")).toContainText("Kaydedilmedi");

  // Bağımlı hücre güncellenir
  await tapCell(page, 0, 0);
  await expect(status(page)).toHaveText("A1: 5");
  // Formül çubuğu mevcut içeriği düzenler: tümünü seçip yazınca değiştirilir
  await formulaBar(page).click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("10");
  await page.keyboard.press("Enter");
  await goTo(page, "A3");
  await expect(status(page)).toHaveText("A3: 17");

  // Aralık seçimi: alt satırda Toplam/Ortalama/Sayı
  await goTo(page, "A1:A3");
  await expect(status(page)).toHaveText("Toplam: 34 · Ortalama: 11,33333333 · Sayı: 3");

  // Geri al / yinele
  await page.getByRole("button", { name: "Geri al" }).click();
  await goTo(page, "A3");
  await expect(status(page)).toHaveText("A3: 12");
  await page.getByRole("button", { name: "Yinele" }).click();
  await expect(status(page)).toHaveText("A3: 17");

  // Temel biçim: kalın
  await page.getByRole("button", { name: "Kalın" }).click();
  await expect(page.getByRole("button", { name: "Kalın" })).toHaveAttribute("aria-pressed", "true");

  // Kaydet: indirilen dosya .xlsx
  const d = await download(page, () => page.getByRole("button", { name: "Kaydet", exact: true }).click());
  expect(d.suggestedFilename()).toBe("Kitap1.xlsx");
  // Çıktı dizini adı Türkçe karakter içerir; dosya seçici için ASCII geçici yol
  const saved = path.join(mkdtempSync(path.join(os.tmpdir(), "oh-tablo-")), "Kitap1.xlsx");
  await d.saveAs(saved);
  await expect(page.locator(".m-appbar-sub")).toContainText("Kaydedildi");

  // Kaydedildiği için geri soru sormadan döner; yeniden açınca değerler korunur
  await page.getByRole("button", { name: "Geri", exact: true }).click();
  await openFile(page, saved);
  await ready(page);
  await expect(page.getByRole("button", { name: "Düzenle" })).toBeVisible();
  await goTo(page, "A3");
  await expect(status(page)).toHaveText("A3: 17");
  await expect(formulaBar(page)).toHaveValue("=TOPLA(A1:A2)");
  await expect(formulaBar(page)).toHaveAttribute("readonly", "");
  await goTo(page, "A1:A3");
  await expect(status(page)).toContainText("Toplam: 34");
});

test("ods açılır, gizli sayfa görünmez, sayfa sekmesi geçişi", async ({ page }) => {
  await start(page);
  await openFile(page, fixture("tablo", "ornek.ods"));
  await ready(page);
  await expect(status(page)).toHaveText("A1: Ürün");
  const tabs = page.getByRole("tablist", { name: "Sayfalar" }).getByRole("tab");
  await expect(tabs).toHaveText(["Satışlar", "Özet", "Uzun"]);
  await page.getByRole("tab", { name: "Özet" }).click();
  await expect(page.getByRole("tab", { name: "Özet" })).toHaveAttribute("aria-selected", "true");
  await expect(status(page)).toHaveText("A1: Satış toplamı");
  await goTo(page, "B1");
  await expect(status(page)).toHaveText("B1: 234,25");
  await page.getByRole("tab", { name: "Uzun" }).click();
  await goTo(page, "C360");
  await expect(status(page)).toHaveText("C360: 1080");
});

test("xls açılır; kaydedince .xlsx olur", async ({ page }) => {
  await start(page);
  await openFile(page, fixture("tablo", "ornek.xls"));
  await ready(page);
  await expect(status(page)).toHaveText("A1: Ürün");
  await goTo(page, "D5");
  await expect(status(page)).toHaveText("D5: 234,25");
  await expect(formulaBar(page)).toHaveValue("=TOPLA(D2:D4)");
  const d = await download(page, () => page.getByRole("button", { name: "Kaydet", exact: true }).click());
  expect(d.suggestedFilename()).toBe("ornek.xlsx");
  await expect(page.locator(".m-toast").filter({ hasText: ".xlsx olarak kaydedildi" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ornek.xlsx" })).toBeVisible();
});

test("şifreli dosyada anlaşılır hata", async ({ page }) => {
  await start(page);
  await openFile(page, fixture("tablo", "sifreli.xls"));
  const alert = page.getByRole("alert").filter({ hasText: "Dosya açılamadı" });
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await expect(alert).toContainText("parola");
  await alert.getByRole("button", { name: "Geri dön" }).click();
  await expect(page.getByRole("button", { name: "Aç", exact: true })).toBeVisible();
});

test("grafikli dosyada grafik ve resim yalnız görüntülenir", async ({ page }) => {
  await start(page);
  await openFile(page, GRAFIKLI);
  await ready(page);
  const chart = page.locator(".m-tablo-objects .tb-float.is-chart");
  await expect(chart).toBeVisible();
  await expect(chart.locator("svg").first()).toBeVisible();
  await expect(chart).toContainText("Gelir ve gider");
  await expect(page.locator(".m-tablo-objects .tb-float.is-image img")).toBeVisible();
  // Grafiğe dokunmak onu seçmez/taşımaz; alttaki hücre seçilir
  const before = await chart.boundingBox();
  const box = (await chart.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(".tb-float.is-selected")).toHaveCount(0);
  await expect(status(page)).not.toHaveText(/^A1/);
  expect(await chart.boundingBox()).toEqual(before);
  // Gizli sayfa sekmede yok
  await expect(page.getByRole("tab", { name: "Gizli" })).toHaveCount(0);
});

test("sayfa ekle, yeniden adlandır ve bul", async ({ page }) => {
  await start(page);
  await newDoc(page, "tablo");
  await ready(page);
  await enter(page, "elma", "armut");
  await page.getByRole("button", { name: "Yeni sayfa" }).click();
  await expect(page.getByRole("tab", { name: "Sayfa2" })).toHaveAttribute("aria-selected", "true");
  // Etkin sekmeye dokunma sayfa menüsünü açar
  await page.getByRole("tab", { name: "Sayfa2" }).click();
  await page.getByRole("button", { name: "Yeniden adlandır" }).click();
  await page.getByLabel("Sayfa adı").fill("Özet");
  await page.getByRole("button", { name: "Tamam", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Özet" })).toBeVisible();
  // Bul: diğer sayfadaki eşleşmeye gider
  await page.getByRole("button", { name: "Daha fazla" }).click();
  await page.getByRole("button", { name: "Bul", exact: true }).click();
  await page.getByLabel("Bul", { exact: true }).fill("armut");
  await expect(page.getByRole("tab", { name: "Sayfa1" })).toHaveAttribute("aria-selected", "true");
  await expect(status(page)).toHaveText("A2: armut");
  await expect(page.locator(".m-tablo-find-count")).toHaveText("1/1");
});

test("dokunmatik: uzun basıp aralık seçimi, kaydırma, kıstırma ve yakınlaştırma düğmeleri", async ({ page }) => {
  await start(page);
  await newDoc(page, "tablo");
  await ready(page);
  await enter(page, "1", "2", "3");
  await formulaBar(page).blur();
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", pts: [number, number][]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const box = (await grid(page).boundingBox())!;
  const cx = box.x + 32 + 30;
  const rowY = (r: number) => box.y + 20 + r * 20 + 10;

  // Uzun basıp sürükleyerek A1:A3 seçilir; alt satırda toplam
  await touch("touchStart", [[cx, rowY(0)]]);
  await page.waitForTimeout(650);
  for (let i = 1; i <= 4; i++) await touch("touchMove", [[cx, rowY(0) + i * 10]]);
  await touch("touchEnd", []);
  await expect(status(page)).toHaveText("Toplam: 6 · Ortalama: 2 · Sayı: 3");

  // Tek parmakla kaydırma (durup bırakınca fırlatma yok): ilk satırdaki dokunma 16. satırı seçer
  await touch("touchStart", [[cx + 80, rowY(20)]]);
  for (let i = 1; i <= 15; i++) await touch("touchMove", [[cx + 80, rowY(20) - i * 20]]);
  await page.waitForTimeout(120);
  await touch("touchEnd", []);
  await page.touchscreen.tap(cx, rowY(0));
  await expect(status(page)).toHaveText("A16");

  // Yakınlaştırma düğmeleri ve iki parmakla kıstırma
  const zoom = page.locator(".m-tablo-zoom-value");
  await expect(zoom).toHaveText("%100");
  await page.getByRole("button", { name: "Yakınlaştır", exact: true }).click();
  await expect(zoom).toHaveText("%115");
  await touch("touchStart", [[box.x + 150, box.y + 200], [box.x + 250, box.y + 300]]);
  for (let i = 1; i <= 10; i++) await touch("touchMove", [[box.x + 150 - i * 5, box.y + 200 - i * 5], [box.x + 250 + i * 5, box.y + 300 + i * 5]]);
  await touch("touchEnd", []);
  await expect(zoom).toHaveText("%230");
  await zoom.click();
  await expect(zoom).toHaveText("%100");
});

test("kaydedilmemiş değişiklikte geri tuşu kaydetme sorusu", async ({ page }) => {
  await start(page);
  await newDoc(page, "tablo");
  await ready(page);
  await enter(page, "42");
  await page.getByRole("button", { name: "Geri", exact: true }).click();
  const dlg = page.getByRole("alertdialog", { name: "Değişiklikler kaydedilsin mi?" });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole("button")).toHaveText(["Kaydet", "Kaydetme", "Vazgeç"]);
  await dlg.getByRole("button", { name: "Vazgeç" }).click();
  await expect(dlg).toBeHidden();
  await expect(grid(page)).toBeVisible();
  await page.getByRole("button", { name: "Geri", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Kaydetme" }).click();
  await expect(page.getByRole("button", { name: "Aç", exact: true })).toBeVisible();
});

test("ızgara koyu temada koyu, açık temada beyaz çizilir @koyu", async ({ page }) => {
  await start(page);
  await openFile(page, GRAFIKLI);
  await ready(page);
  await page.waitForTimeout(300);
  const dark = await page.evaluate(() => document.documentElement.hasAttribute("data-oh-dark"));
  expect(dark).toBe(test.info().project.name === "koyu");
  // Boş hücre (F15 civarı) ve dolgulu başlık hücresinin pikselleri
  const px = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>(".m-tablo-canvas")!;
    const dpr = c.width / c.clientWidth;
    const at = (x: number, y: number) => Array.from(c.getContext("2d")!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data.slice(0, 3));
    return { empty: at(c.clientWidth - 12, c.clientHeight - 12), header: at(60, 30) };
  });
  const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (dark) {
    expect(lum(px.empty)).toBeLessThan(60);
    // Belirgin dolgulu hücre kâğıttaki gibi kendi renginde (koyu mavi başlık)
    expect(px.header[2]).toBeGreaterThan(px.header[0]);
  } else expect(lum(px.empty)).toBeGreaterThan(240);

  // Grafik kutusu: koyu temada zemin koyu (beyaz kutu kalmaz), seri çubuğu özgün renginde
  const chart = page.locator(".m-tablo-objects .tb-float.is-chart");
  await expect(chart).toBeVisible();
  const bar = chart.locator("rect.tb-chart-mark").first();
  const cb = (await chart.boundingBox())!;
  const bb = (await bar.boundingBox())!;
  const barFill = (await bar.getAttribute("fill"))!;
  const shot = await chart.screenshot();
  const [area, barPx] = await page.evaluate(
    async ({ b64, w, pts }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext("2d")!;
      x.drawImage(img, 0, 0);
      const k = img.width / w;
      return pts.map(([px, py]) => Array.from(x.getImageData(Math.round(px * k), Math.round(py * k), 1, 1).data.slice(0, 3)));
    },
    { b64: shot.toString("base64"), w: cb.width, pts: [[8, 8], [bb.x - cb.x + bb.width / 2, bb.y - cb.y + bb.height / 2]] as [number, number][] },
  );
  if (dark) expect(lum(area)).toBeLessThan(60);
  else expect(lum(area)).toBeGreaterThan(240);
  const hex = [1, 3, 5].map((i) => parseInt(barFill.slice(i, i + 2), 16));
  barPx.forEach((v, i) => expect(Math.abs(v - hex[i])).toBeLessThanOrEqual(6));
  await page.screenshot({ path: test.info().outputPath(`tablo-${dark ? "koyu" : "acik"}.png`) });
});
