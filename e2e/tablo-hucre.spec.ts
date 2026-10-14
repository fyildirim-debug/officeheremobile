// Tablo hücre işlemleri: kopyala/kes/yapıştır, birleştir, kenarlıklar, yazı tipi boyutu, sıralama ve
// filtre; kaydet-aç turunda korunur. Izgara tuval olduğundan doğrulama Ad Kutusu, durum metni ve
// (geliştirme sunucusunda) denetleyici modeliyle yapılır.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { download, newDoc, start } from "./ortak";

const status = (page: Page) => page.getByRole("status", { name: "Hücre bilgisi" });
const formulaBar = (page: Page) => page.getByLabel("Formül çubuğu", { exact: true });
const nameBox = (page: Page) => page.getByLabel("Ad Kutusu", { exact: true });
const arac = (page: Page, ad: string) => page.getByRole("navigation", { name: "Biçimlendirme" }).getByRole("button", { name: ad, exact: true });

async function goTo(page: Page, ref: string) {
  await nameBox(page).fill(ref);
  await nameBox(page).press("Enter");
}

async function enter(page: Page, ref: string, ...values: string[]) {
  await goTo(page, ref);
  await formulaBar(page).click();
  for (const v of values) {
    await page.keyboard.type(v);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.press("Escape");
}

/** Geliştirme sunucusundaki denetleyiciden etkin sayfa bilgisi. */
function sayfa(page: Page) {
  return page.evaluate(() => {
    const ctl = (window as unknown as { __tabloMobil: { sheet: { merges: { r1: number; c1: number; r2: number; c2: number }[]; autoFilter: unknown; filterHidden: Set<number> }; wb: { styleAt: (s: unknown, r: number, c: number) => Record<string, unknown> } } }).__tabloMobil;
    const st = (r: number, c: number) => ctl.wb.styleAt(ctl.sheet, r, c);
    return {
      merges: ctl.sheet.merges.map((m) => [m.r1, m.c1, m.r2, m.c2]),
      filtre: !!ctl.sheet.autoFilter,
      gizli: [...ctl.sheet.filterHidden].sort(),
      a1: st(0, 0),
      b2: st(1, 1),
    };
  });
}

async function yeniTablo(page: Page) {
  await start(page);
  await newDoc(page, "tablo");
  await expect(page.locator(".m-tablo-grid")).toBeVisible({ timeout: 30_000 });
}

test.describe("Tablo hücre işlemleri", () => {
  test("kopyala/yapıştır göreli formülü kaydırır; kes taşır; geri alınır", async ({ page }) => {
    await yeniTablo(page);
    await enter(page, "A1", "2", "3", "=A1*A2");
    await goTo(page, "A1:A3");
    await arac(page, "Kopyala").click();
    await expect(page.getByRole("status").filter({ hasText: "Kopyalandı." })).toBeVisible();
    await goTo(page, "C1");
    await arac(page, "Yapıştır").click();
    // Yapıştırma eşzamansız (pano okunur); bitince yapıştırılan aralık seçili olur.
    await expect(status(page)).toContainText("Toplam: 11");
    await goTo(page, "C3");
    await expect(status(page)).toHaveText("C3: 6");
    await expect(formulaBar(page)).toHaveValue("=C1*C2");

    // Kes: kaynak boşalır, hedefe taşınır
    await goTo(page, "C1:C3");
    await arac(page, "Kes").click();
    await goTo(page, "E5");
    await arac(page, "Yapıştır").click();
    await expect(status(page)).toContainText("Toplam: 11");
    await goTo(page, "E7");
    await expect(formulaBar(page)).toHaveValue("=E5*E6");
    await expect(status(page)).toHaveText("E7: 6");
    await goTo(page, "C1");
    await expect(status(page)).toHaveText("C1");

    await page.getByRole("button", { name: "Geri al" }).click();
    await goTo(page, "C3");
    await expect(status(page)).toHaveText("C3: 6");
  });

  test("birleştir ve ortala, kenarlık, yazı boyutu; .xlsx kaydet-aç turunda korunur", async ({ page }) => {
    await yeniTablo(page);
    await enter(page, "A1", "Başlık");
    await enter(page, "B2", "7");
    await goTo(page, "A1:C1");
    await arac(page, "Birleştir ve ortala").click();
    await expect(arac(page, "Birleştir ve ortala")).toHaveAttribute("aria-pressed", "true");

    await goTo(page, "B2");
    await arac(page, "Kenarlıklar").click();
    await page.getByRole("dialog", { name: "Kenarlıklar" }).getByRole("button", { name: "Tüm kenarlıklar" }).click();

    await goTo(page, "A1");
    await arac(page, "Yazı tipi ve boyutu").click();
    const panel = page.getByRole("dialog", { name: "Yazı tipi" });
    await panel.getByRole("option", { name: "18", exact: true }).click();
    await expect(panel.getByLabel("Yazı tipi boyutu")).toHaveText("18");
    await panel.getByRole("button", { name: "Yazı tipini büyült" }).click();
    await expect(panel.getByLabel("Yazı tipi boyutu")).toHaveText("20");
    await panel.getByRole("option", { name: "Georgia" }).click();
    await panel.getByRole("button", { name: "Kapat" }).click();

    let s = await sayfa(page);
    expect(s.merges).toEqual([[0, 0, 0, 2]]);
    expect(s.a1).toMatchObject({ size: 20, font: "Georgia", hAlign: "center" });
    expect(s.b2).toMatchObject({ bTop: { style: "thin" }, bBottom: { style: "thin" }, bLeft: { style: "thin" }, bRight: { style: "thin" } });

    // Kaydet ve yeniden aç
    const d = await download(page, () => page.getByRole("button", { name: "Kaydet", exact: true }).click());
    const buffer = readFileSync(await d.path());
    await page.getByRole("button", { name: "Geri", exact: true }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Aç", exact: true }).click();
    await (await chooser).setFiles({ name: "Kitap1.xlsx", mimeType: "application/octet-stream", buffer });
    await expect(page.locator(".m-tablo-grid")).toBeVisible({ timeout: 30_000 });
    s = await sayfa(page);
    expect(s.merges).toEqual([[0, 0, 0, 2]]);
    expect(s.a1).toMatchObject({ size: 20, font: "Georgia", hAlign: "center" });
    expect(s.b2).toMatchObject({ bTop: { style: "thin" }, bRight: { style: "thin" } });

    // Birleştirmeyi çöz (Hizalama paneli)
    await page.getByRole("button", { name: "Düzenle" }).click();
    await goTo(page, "A1");
    await arac(page, "Hizalama").click();
    await page.getByRole("dialog", { name: "Hizalama" }).getByRole("button", { name: "Birleştirmeyi çöz" }).click();
    expect((await sayfa(page)).merges).toEqual([]);
  });

  test("sırala, filtre aç, değer süz ve temizle; filtre düğmesine dokunma", async ({ page }) => {
    await yeniTablo(page);
    await enter(page, "A1", "Şehir", "İzmir", "Ankara", "Çorum", "Ankara", "Bursa");
    await enter(page, "B1", "Adet", "5", "3", "9", "2", "4");

    await goTo(page, "A3");
    await arac(page, "Sırala ve filtrele").click();
    await page.getByRole("button", { name: /A'dan Z'ye sırala/ }).click();
    // Türkçe sıra; başlık yerinde kalır, satırlar birlikte taşınır
    const a = [];
    for (const r of [1, 2, 3, 4, 5, 6]) {
      await goTo(page, `A${r}`);
      a.push((await status(page).textContent())?.replace(/^A\d+: /, ""));
    }
    expect(a).toEqual(["Şehir", "Ankara", "Ankara", "Bursa", "Çorum", "İzmir"]);
    await goTo(page, "B6");
    await expect(status(page)).toHaveText("B6: 5");

    // Filtre
    await goTo(page, "A1");
    await arac(page, "Sırala ve filtrele").click();
    await page.getByRole("menuitemcheckbox", { name: /Filtre/ }).click();
    await expect(arac(page, "Sırala ve filtrele")).toHaveAttribute("aria-pressed", "true");
    expect((await sayfa(page)).filtre).toBe(true);
    await arac(page, "Sırala ve filtrele").click();
    await page.getByRole("button", { name: "«Şehir» sütununu süz…" }).click();
    const fp = page.getByRole("dialog", { name: "Filtre: Şehir" });
    await expect(fp.getByRole("menuitemcheckbox")).toHaveText(["Tümünü seç", "Ankara", "Bursa", "Çorum", "İzmir"]);
    await fp.getByRole("menuitemcheckbox", { name: "Tümünü seç" }).click();
    await expect(fp.getByRole("button", { name: "Uygula" })).toBeDisabled();
    await fp.getByRole("menuitemcheckbox", { name: "Ankara" }).click();
    await fp.getByRole("button", { name: "Uygula" }).click();
    await expect(page.getByRole("status").filter({ hasText: "5 kayıttan 2 tanesi bulundu" })).toBeVisible();
    expect((await sayfa(page)).gizli).toEqual([3, 4, 5]);

    // Başlıktaki filtre düğmesine dokunma (B1 sağ kenarı) panel açar
    const box = (await page.locator(".m-tablo-grid").boundingBox())!;
    await page.touchscreen.tap(box.x + 32 + 64 * 2 - 8, box.y + 20 + 10);
    await expect(page.getByRole("dialog", { name: "Filtre: Adet" })).toBeVisible();
    await page.getByRole("dialog", { name: "Filtre: Adet" }).getByRole("button", { name: "Kapat" }).click();

    await arac(page, "Sırala ve filtrele").click();
    await page.getByRole("button", { name: "Filtreleri temizle" }).click();
    expect((await sayfa(page)).gizli).toEqual([]);
    await page.getByRole("button", { name: "Geri al" }).click();
    expect((await sayfa(page)).gizli).toEqual([3, 4, 5]);
  });
});
