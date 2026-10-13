import { expect, test } from "@playwright/test";
import { start } from "./ortak";

test.describe("başlangıç", () => {
  test("yeni belge kutucukları ve aç düğmesi", async ({ page }) => {
    await start(page);
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(/Günaydın|İyi günler|İyi akşamlar|İyi geceler/);
    for (const name of ["Yeni belge", "Yeni tablo", "Yeni sunu"]) await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    await expect(page.getByText("Henüz dosya açmadınız.", { exact: false })).toBeVisible();
  });

  test("son kullanılanlar süzülür, sabitlenir ve kaldırılır", async ({ page }) => {
    await start(page);
    await page.evaluate(() =>
      localStorage.setItem(
        "officehere.mobile.recent",
        JSON.stringify([
          { name: "rapor.docx", app: "belge", openedAt: Date.now() - 1000 },
          { name: "bütçe.xlsx", app: "tablo", openedAt: Date.now() - 2000 },
        ]),
      ),
    );
    await page.reload();
    const list = page.getByRole("list", { name: "Son kullanılan dosyalar" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await page.getByRole("tab", { name: "Tablo" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("bütçe.xlsx");
    await page.getByRole("tab", { name: "Tümü" }).click();

    await page.getByRole("button", { name: "bütçe.xlsx seçenekleri" }).click();
    await page.getByRole("button", { name: "Listeye sabitle" }).click();
    await expect(list.getByRole("listitem").first()).toContainText("bütçe.xlsx");
    await expect(list.getByLabel("Sabitlendi")).toBeVisible();

    await page.getByRole("button", { name: "rapor.docx seçenekleri" }).click();
    await page.getByRole("button", { name: "Listeden kaldır" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);

    await page.getByRole("button", { name: "Son kullanılanlarda ara" }).click();
    await page.getByLabel("Dosya adında ara").fill("yok");
    await expect(page.getByText("Eşleşen dosya yok.")).toBeVisible();
  });

  test("tema seçimi koyu ve açık arasında geçer @koyu", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: "Ayarlar" }).click();
    await page.getByRole("radio", { name: "Siyah" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-oh-dark", "");
    await expect(page.locator("html")).toHaveAttribute("data-oh-theme", "black");
    await page.getByRole("radio", { name: "Açık (Beyaz)" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-oh-dark", "");
    await page.getByRole("radio", { name: "Sistem ayarını kullan" }).click();
    const dark = await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches);
    await expect(page.locator("html")).toHaveAttribute("data-oh-theme", dark ? "dark" : "colorful");
  });

  test("koyu temada boş şablon önizlemeleri koyu @koyu", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: "Ayarlar" }).click();
    await page.getByRole("radio", { name: "Koyu Gri" }).click();
    await page.getByRole("button", { name: "Kapat" }).click();
    const fill = await page.locator(".m-home-paper").first().evaluate((el) => getComputedStyle(el).fill);
    expect(fill).toBe("rgb(31, 31, 31)");
  });
});
