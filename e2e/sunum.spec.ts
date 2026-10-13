import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { download, fixture, newDoc, openFile, start } from "./ortak";

const kucukResimler = (page: Page) => page.locator(".m-sunum-seri .m-sunum-thumb");
const kagit = (page: Page) => page.locator(".m-sunum-kagit");
const etkin = (page: Page) => page.locator(".m-sunum-seri .m-sunum-thumb[aria-current='true']");

/** Dokunmatik kaydırma (CDP dokunma olaylarıyla, gerçek parmak hareketi gibi). */
async function kaydir(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Koyu temayı seçer (projenin renk düzeninden bağımsız). */
async function koyuTema(page: Page) {
  await page.evaluate(() => localStorage.setItem("officehere.mobile.theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-oh-dark", "");
}

const bg = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe("sunum", () => {
  test("yeni sunu: başlığa yaz, slayt ekle, kaydet ve yeniden aç", async ({ page }) => {
    await start(page);
    await newDoc(page, "sunum");
    // Yeni sunu düzenleme kipinde: geri al/yinele görünür.
    await expect(page.getByRole("button", { name: "Geri al" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Düzenleme araçları" })).toBeVisible();
    await expect(kucukResimler(page)).toHaveCount(1);

    await page.getByText("Başlık eklemek için tıklayın", { exact: true }).tap();
    await expect(page.locator(".tb-edit")).toBeFocused();
    await page.keyboard.type("Çeyrek sonuçları");
    await expect(kagit(page)).toContainText("Çeyrek sonuçları");

    // Biçim: tümünü seç → kalın.
    await page.keyboard.press("Control+A");
    await page.getByRole("button", { name: "Kalın" }).tap();
    await expect(page.getByRole("button", { name: "Kalın" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Yeni slayt", exact: true }).first().tap();
    await page.getByRole("dialog", { name: "Yeni slayt" }).getByRole("button", { name: "Başlık ve İçerik" }).tap();
    await expect(kucukResimler(page)).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Slayt 2", exact: true })).toHaveAttribute("aria-current", "true");
    await expect(page.locator(".m-appbar-sub")).toContainText("Kaydedilmedi");

    const d = await download(page, () => page.getByRole("button", { name: "Kaydet", exact: true }).tap());
    expect(d.suggestedFilename()).toBe("Sunu1.pptx");
    // Ortak test-results dizini paralel çalışmalarda temizlenebilir: kendi geçici dizinimiz.
    const file = path.join(mkdtempSync(path.join(tmpdir(), "oh-sunum-")), "Sunu1.pptx");
    await d.saveAs(file);
    await expect(page.locator(".m-appbar-sub")).toContainText("Kaydedildi");

    // Kaydedildiği için geri soru sormadan kapanır; dosya yeniden açılınca içerik korunur.
    await page.getByRole("button", { name: "Geri", exact: true }).tap();
    await openFile(page, file);
    await expect(kucukResimler(page)).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Düzenle" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Geri al" })).toHaveCount(0);
    await expect(kagit(page)).toContainText("Çeyrek sonuçları");
    const kalin = await kagit(page).getByText("Çeyrek sonuçları").evaluate((el) => getComputedStyle(el).fontWeight);
    expect(Number(kalin)).toBeGreaterThanOrEqual(700);
  });

  for (const [ad, sayi] of [
    ["lo-proje.pptx", 7],
    ["lo-proje.odp", 7],
    ["lo-proje.ppt", 7],
    ["lo-bicim.ppsx", 4],
    ["lo-bicim.otp", 4],
  ] as const) {
    test(`${ad} açılır (${sayi} slayt)`, async ({ page }) => {
      await start(page);
      await openFile(page, fixture("sunum", ad));
      await expect(kucukResimler(page)).toHaveCount(sayi);
      await expect(kagit(page).locator(".sv")).toBeVisible();
      if (ad.endsWith(".ppsx")) await expect(page.getByRole("button", { name: "Gösteriyi başlat" })).toBeVisible();
      if (ad.endsWith(".otp")) await expect(page.locator(".m-appbar h1")).toHaveText("lo-bicim.pptx");
    });
  }

  test(".ppt kaydedilince .pptx olur", async ({ page }) => {
    await start(page);
    await openFile(page, fixture("sunum", "lo-bicim.ppt"));
    await expect(kucukResimler(page)).toHaveCount(4);
    const d = await download(page, () => page.getByRole("button", { name: "Kaydet", exact: true }).tap());
    expect(d.suggestedFilename()).toBe("lo-bicim.pptx");
    await expect(page.getByText("olarak kaydedildi", { exact: false })).toBeVisible();
    await expect(page.locator(".m-appbar h1")).toHaveText("lo-bicim.pptx");
  });

  test("kaydırınca slayt değişir, küçük resme dokununca gidilir", async ({ page }) => {
    await start(page);
    await openFile(page, fixture("sunum", "lo-proje.pptx"));
    await expect(etkin(page)).toHaveAttribute("aria-label", "Slayt 1");
    const box = (await page.locator(".m-sunum-sahne").boundingBox())!;
    const y = box.y + box.height / 2;
    await kaydir(page, { x: box.x + box.width * 0.85, y }, { x: box.x + box.width * 0.15, y });
    await expect(etkin(page)).toHaveAttribute("aria-label", "Slayt 2");
    await kaydir(page, { x: box.x + box.width * 0.85, y }, { x: box.x + box.width * 0.15, y });
    await expect(etkin(page)).toHaveAttribute("aria-label", "Slayt 3");
    await kaydir(page, { x: box.x + box.width * 0.2, y }, { x: box.x + box.width * 0.9, y });
    await expect(etkin(page)).toHaveAttribute("aria-label", "Slayt 2");
    // Şeridin yumuşak kaydırması bitsin.
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Slayt 6", exact: true }).tap();
    await expect(page.locator(".m-sunum-sayac")).toHaveText("6 / 7");
  });

  test("slayt gösterisi açılır, ileri gider ve kapanır", async ({ page }) => {
    await start(page);
    await openFile(page, fixture("sunum", "lo-proje.pptx"));
    await page.getByRole("button", { name: "Oynat", exact: true }).tap();
    const show = page.locator(".show-root");
    await expect(show).toBeVisible();
    const sayac = page.locator(".m-sunum-show-ust span");
    await expect(sayac).toHaveText("1 / 7");
    const vp = page.viewportSize()!;
    await page.mouse.click(vp.width * 0.8, vp.height / 2);
    await expect(sayac).toHaveText("2 / 7");
    await page.keyboard.press("ArrowRight");
    await expect(sayac).toHaveText("3 / 7");
    // Sol kenara dokunma geri götürür.
    await page.mouse.click(vp.width * 0.1, vp.height / 2);
    await expect(sayac).toHaveText("2 / 7");
    await page.getByRole("button", { name: "Gösteriyi bitir" }).click();
    await expect(show).toHaveCount(0);
    await expect(etkin(page)).toHaveAttribute("aria-label", "Slayt 2");
  });

  test("düzenleme: slayt menüsüyle çoğalt, gizle, taşı, sil; geri al", async ({ page }) => {
    await start(page);
    await openFile(page, fixture("sunum", "lo-proje.pptx"));
    await page.getByRole("button", { name: "Düzenle" }).tap();
    await page.getByRole("button", { name: "Slayt 2", exact: true }).click({ button: "right" });
    const menu = page.getByRole("dialog", { name: "Slayt 2" });
    await menu.getByRole("button", { name: "Çoğalt" }).tap();
    await expect(kucukResimler(page)).toHaveCount(8);
    await expect(etkin(page)).toHaveAttribute("aria-label", "Slayt 3");

    await page.getByRole("button", { name: "Slayt 3", exact: true }).click({ button: "right" });
    await page.getByRole("dialog", { name: "Slayt 3" }).getByRole("button", { name: "Slaydı gizle" }).tap();
    await expect(page.getByRole("button", { name: "Slayt 3 (gizli)" })).toBeVisible();

    await page.getByRole("button", { name: "Slayt 3 (gizli)" }).click({ button: "right" });
    await page.getByRole("dialog", { name: "Slayt 3 (gizli)" }).getByRole("button", { name: "Aşağı taşı" }).tap();
    await expect(page.getByRole("button", { name: "Slayt 4 (gizli)" })).toHaveAttribute("aria-current", "true");

    await page.getByRole("button", { name: "Slayt 4 (gizli)" }).click({ button: "right" });
    await page.getByRole("dialog", { name: "Slayt 4 (gizli)" }).getByRole("button", { name: "Sil" }).tap();
    await expect(kucukResimler(page)).toHaveCount(7);
    await page.getByRole("button", { name: "Geri al" }).tap();
    await expect(kucukResimler(page)).toHaveCount(8);
    await page.getByRole("button", { name: "Yinele" }).tap();
    await expect(kucukResimler(page)).toHaveCount(7);
  });

  test("notlar görüntülenir ve düzenlenir; Slaytlar ızgarası", async ({ page }) => {
    await start(page);
    await openFile(page, fixture("sunum", "lo-bicim.odp"));
    await page.getByRole("button", { name: "Notlar" }).tap();
    await expect(page.locator(".m-sunum-notlar-metin")).toBeVisible();
    await page.getByRole("button", { name: "Düzenle" }).tap();
    const not = page.getByLabel("Slayt notları");
    await not.fill("Konuşmacı için hatırlatma");
    await expect(page.locator(".m-appbar-sub")).toContainText("Kaydedilmedi");
    await page.getByRole("button", { name: "Daha fazla" }).tap();
    await expect(page.getByText("Slayt boyutu:")).toBeVisible();
    // Düzenleme bitince notlar salt okunur gösterilir.
    await page.getByRole("button", { name: "Düzenlemeyi bitir" }).tap();
    await expect(page.locator(".m-sunum-notlar-metin")).toHaveText("Konuşmacı için hatırlatma");
    await page.getByRole("button", { name: "Daha fazla" }).tap();
    await page.getByRole("button", { name: "Slaytlar", exact: true }).tap();
    const izgara = page.getByRole("dialog", { name: "Slaytlar" });
    await expect(izgara.locator(".m-sunum-thumb")).toHaveCount(4);
    await izgara.getByRole("button", { name: "Slayt 3", exact: true }).tap();
    await expect(izgara).toHaveCount(0);
    await expect(etkin(page)).toHaveAttribute("aria-label", "Slayt 3");
  });

  test("kaydedilmemiş değişiklikte geri kaydetme sorusu sorar", async ({ page }) => {
    await start(page);
    await newDoc(page, "sunum");
    await page.getByText("Başlık eklemek için tıklayın", { exact: true }).tap();
    await page.keyboard.type("Taslak");
    await page.getByRole("button", { name: "Geri", exact: true }).tap();
    const soru = page.getByRole("alertdialog");
    await expect(soru).toBeVisible();
    await expect(soru.getByRole("button", { name: "Kaydet", exact: true })).toBeVisible();
    await soru.getByRole("button", { name: "Vazgeç" }).tap();
    await expect(kagit(page)).toContainText("Taslak");
    await page.getByRole("button", { name: "Geri", exact: true }).tap();
    await page.getByRole("alertdialog").getByRole("button", { name: "Kaydetme" }).tap();
    await expect(page.getByRole("button", { name: "Yeni sunu", exact: true })).toBeVisible();
  });

  test("koyu temada beyaz zeminli slayt ekranda koyu, gösteride özgün renkte @koyu", async ({ page }) => {
    await start(page);
    await koyuTema(page);
    await openFile(page, fixture("sunum", "lo-proje.pptx"));
    await page.getByRole("button", { name: "Slayt 2", exact: true }).tap();
    // Ekranda: zemin ve yazı koyu temaya göre.
    expect(await bg(page, ".m-sunum-kagit .sv-bg")).toBe("rgb(30, 30, 30)");
    const yazi = await kagit(page).getByText("Gündem").evaluate((el) => getComputedStyle(el).color);
    const [r, g, b] = yazi.match(/\d+/g)!.map(Number);
    expect(0.299 * r + 0.587 * g + 0.114 * b).toBeGreaterThan(150);
    // Küçük resim de koyu; tasarımlı koyu başlık slaydı olduğu gibi.
    expect(await bg(page, ".m-sunum-seri [data-index='1'] .sv-bg")).toBe("rgb(30, 30, 30)");
    expect(await bg(page, ".m-sunum-seri [data-index='0'] .sv-bg")).not.toBe("rgb(30, 30, 30)");
    // Piksel: slaytın ortası koyu.
    const png = await kagit(page).screenshot();
    expect(png.byteLength).toBeGreaterThan(1000);
    const koyuMu = await page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const [r2, g2, b2] = ctx.getImageData(Math.round(img.width * 0.8), Math.round(img.height * 0.5), 1, 1).data;
      return 0.299 * r2 + 0.587 * g2 + 0.114 * b2 < 60;
    }, png.toString("base64"));
    expect(koyuMu).toBe(true);

    // Gösteride özgün (beyaz) renk.
    await page.getByRole("button", { name: "Oynat", exact: true }).tap();
    await expect(page.locator(".m-sunum-show-ust span")).toHaveText("2 / 7");
    expect(await bg(page, ".show-layer .sv-bg")).toBe("rgb(255, 255, 255)");
    await page.getByRole("button", { name: "Gösteriyi bitir" }).click();
    await expect(page.locator(".show-root")).toHaveCount(0);

    // Açık resim zeminli slayt da koyulaşır (resim yalnız ekranda ters çevrilir); grafik yazıları açılır.
    await page.getByRole("button", { name: "Geri", exact: true }).tap();
    await openFile(page, path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/sunum/resim-zemin.pptx"));
    await expect(kagit(page).locator(".sv.m-skz")).toHaveCount(1);
    expect(await kagit(page).locator(".sv-bg").evaluate((el) => getComputedStyle(el).filter)).toContain("invert");
    await page.getByRole("button", { name: "Slayt 2", exact: true }).tap();
    const eksen = await kagit(page).locator(".m-skc text").first().evaluate((el) => getComputedStyle(el).fill);
    const [er, eg, eb] = eksen.match(/\d+/g)!.map(Number);
    expect(0.299 * er + 0.587 * eg + 0.114 * eb).toBeGreaterThan(120);
    await page.getByRole("button", { name: "Geri", exact: true }).tap();
    await openFile(page, fixture("sunum", "lo-proje.pptx"));
    await page.getByRole("button", { name: "Slayt 2", exact: true }).tap();

    // Düzenlemede yazılan metin modelde özgün renkte kalır, ekranda açık görünür.
    await page.getByRole("button", { name: "Düzenle" }).tap();
    await kagit(page).getByText("Gündem").tap();
    await kagit(page).getByText("Gündem").tap();
    await expect(page.locator(".tb-edit")).toBeFocused();
    const dolgu = await page.locator(".tb-edit span").first().evaluate((el) => getComputedStyle(el).webkitTextFillColor);
    expect(dolgu).not.toBe("rgb(0, 0, 0)");
  });
});
