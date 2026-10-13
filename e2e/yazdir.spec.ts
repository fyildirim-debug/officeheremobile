// Yazdır / PDF: üç uygulamada masaüstünün yazdırma kökü kurulur, sistem yazdırma penceresi açılır
// (tarayıcıda window.print; Android'de yazdırma eklentisi), iş bitince kök kaldırılır. Koyu temada
// da kâğıt beyaz, yazı siyah basılır.
import { expect, test, type Page } from "@playwright/test";
import { fixture, newDoc, openFile, start } from "./ortak";

interface Baski {
  sayfa: number;
  metin: string;
  sinif: string;
  pageCss: string;
  kok: string;
  html: string;
}

/** window.print yerine yazdırma anındaki kökün kopyası alınır. */
async function baskiYakala(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __baskilar: unknown[] };
    w.__baskilar = [];
    window.print = () => {
      const kok = document.querySelector<HTMLElement>("#bl-print-root, #tb-print, .print-root");
      w.__baskilar.push({
        sayfa: kok ? kok.querySelectorAll(":scope > .bl-print-page, .tb-print-page, .print-page").length : 0,
        metin: kok?.textContent ?? "",
        sinif: document.documentElement.className,
        pageCss: [...document.querySelectorAll("style")].map((s) => s.textContent ?? "").filter((t) => t.includes("@page")).join("\n"),
        kok: kok ? `${kok.id}.${kok.className}` : "",
        html: kok?.outerHTML ?? "",
      });
    };
  });
}

const baskilar = (page: Page) => page.evaluate(() => (window as unknown as { __baskilar: Baski[] }).__baskilar);

/** Basılan kökü yeniden ekleyip yazdırma ortamında hesaplanan renkleri okur. */
async function baskiRenkleri(page: Page, b: Baski) {
  await page.evaluate((x) => {
    document.body.insertAdjacentHTML("beforeend", x.html);
    document.documentElement.className = x.sinif;
  }, b);
  await page.emulateMedia({ media: "print" });
  const r = await page.evaluate(() => ({
    govde: getComputedStyle(document.body).backgroundColor,
    yazi: getComputedStyle(document.body).color,
    duzen: getComputedStyle(document.documentElement).colorScheme,
    kok: getComputedStyle(document.getElementById("root")!).display,
  }));
  await page.emulateMedia({ media: null });
  return r;
}

test.describe("yazdır / PDF", () => {
  test("Belge: mobil görünümde de sayfa düzeninin sayfaları basılır, görünüm geri döner @koyu", async ({ page }) => {
    await baskiYakala(page);
    await start(page);
    await openFile(page, fixture("belge", "cok-bolumlu.docx"));
    await expect(page.locator(".bl-body .ProseMirror")).toBeVisible();
    await page.getByRole("button", { name: "Mobil görünüm" }).click();
    await expect(page.getByRole("button", { name: "Sayfa düzeni" })).toBeVisible();
    await page.getByRole("button", { name: "Daha fazla" }).click();
    await page.getByRole("button", { name: /Yazdır \/ PDF/ }).click();
    await expect.poll(async () => (await baskilar(page)).length).toBe(1);
    const [b] = await baskilar(page);
    expect(b.kok).toBe("bl-print-root.bl-print-root");
    expect(b.sayfa).toBeGreaterThan(5);
    expect(b.metin).toContain("Bölüm 1");
    expect(b.sinif).toContain("bl-yazdiriliyor");
    expect(b.pageCss).toMatch(/@page[^{]*\{ size: \d+(\.\d+)?px \d+(\.\d+)?px; margin: 0; \}/);
    // Kök kaldırılır, mobil görünüm sürer.
    await expect(page.locator("#bl-print-root")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveClass(/bl-yazdiriliyor/);
    await expect(page.getByRole("button", { name: "Sayfa düzeni" })).toBeVisible();
    const r = await baskiRenkleri(page, b);
    expect(r).toEqual({ govde: "rgb(255, 255, 255)", yazi: expect.any(String), duzen: "light", kok: "none" });
  });

  test("Tablo: etkin sayfa, tüm kitap ve seçim; koyu temada kâğıt beyaz, yazı siyah @koyu", async ({ page }) => {
    await baskiYakala(page);
    await start(page);
    await openFile(page, fixture("tablo", "ornek.ods"));
    await expect(page.locator(".m-tablo-grid")).toBeVisible({ timeout: 30_000 });
    const yazdir = async (kapsam: string) => {
      await page.getByRole("button", { name: "Daha fazla" }).click();
      await page.getByRole("button", { name: /Yazdır \/ PDF/ }).click();
      await expect(page.getByRole("dialog", { name: "Yazdır / PDF" })).toBeVisible();
      await page.getByRole("button", { name: new RegExp(`^${kapsam}`) }).click();
    };
    await yazdir("Etkin sayfa");
    await expect.poll(async () => (await baskilar(page)).length).toBe(1);
    let [b] = await baskilar(page);
    expect(b.kok).toBe("tb-print.");
    expect(b.metin).toContain("Kahve");
    expect(b.metin).not.toContain("Satış toplamı");
    expect(b.sinif).toContain("tb-yazdiriliyor");
    expect(b.pageCss).toContain("@page { size: A4");
    // Kök ve @page kuralı kaldırılır (sonraki yazdırmayı etkilemez).
    await expect(page.locator("#tb-print")).toHaveCount(0);
    await expect(page.locator("#tb-print-page")).toHaveCount(0);
    const r = await baskiRenkleri(page, b);
    expect(r).toEqual({ govde: "rgb(255, 255, 255)", yazi: "rgb(0, 0, 0)", duzen: "light", kok: "none" });
    await page.locator("#tb-print").evaluate((el) => el.remove());

    await yazdir("Tüm çalışma kitabı");
    await expect.poll(async () => (await baskilar(page)).length).toBe(2);
    b = (await baskilar(page))[1];
    expect(b.metin).toContain("Satış toplamı");
    expect(b.metin).toContain("Kahve");

    await page.getByLabel("Ad Kutusu", { exact: true }).fill("A2:A3");
    await page.getByLabel("Ad Kutusu", { exact: true }).press("Enter");
    await yazdir("Seçim");
    await expect.poll(async () => (await baskilar(page)).length).toBe(3);
    b = (await baskilar(page))[2];
    expect(b.metin).toContain("Çay");
    expect(b.metin).toContain("Şeker");
    expect(b.metin).not.toContain("Kahve");
  });

  test("Tablo: boş sayfada yazdırılacak veri yok bilgisi", async ({ page }) => {
    await baskiYakala(page);
    await start(page);
    await newDoc(page, "tablo");
    await expect(page.locator(".m-tablo-grid")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Daha fazla" }).click();
    await page.getByRole("button", { name: /Yazdır \/ PDF/ }).click();
    await page.getByRole("button", { name: /^Etkin sayfa/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Yazdırılacak veri yok." })).toBeVisible();
    expect(await baskilar(page)).toHaveLength(0);
  });

  test("Sunum: gizli olmayan her slayt bir sayfa, slayt boyutunda @koyu", async ({ page }) => {
    await baskiYakala(page);
    await start(page);
    await openFile(page, fixture("sunum", "lo-proje.pptx"));
    await expect(page.locator(".m-sunum-kagit")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Daha fazla" }).click();
    await page.getByRole("button", { name: /Yazdır \/ PDF/ }).click();
    await expect.poll(async () => (await baskilar(page)).length).toBe(1);
    const [b] = await baskilar(page);
    expect(b.kok).toBe(".print-root");
    expect(b.sayfa).toBe(7);
    expect(b.sinif).toContain("is-printing");
    expect(b.pageCss).toMatch(/@page \{ size: [\d.]+(cm|in) [\d.]+(cm|in); margin: 0; \}/);
    await expect(page.locator(".print-root")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveClass(/is-printing/);
  });
});
