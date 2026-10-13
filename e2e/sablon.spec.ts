// Şablondan yeni: başlangıç ekranındaki Şablonlar listesi masaüstü şablonlarını açar; yeni belge
// şablonun adıyla, kaydedilmemiş ve düzenleme kipinde gelir; kaydedince şablon adıyla iner.
import { expect, test, type Page } from "@playwright/test";
import { download, start } from "./ortak";

async function sablon(page: Page, ad: string) {
  await page.getByRole("button", { name: "Şablonlar" }).click();
  await page.getByRole("dialog", { name: "Şablondan yeni" }).getByRole("listitem").filter({ hasText: new RegExp(`^.?${ad}$`) }).click();
}

const geriDon = async (page: Page) => {
  await page.getByRole("button", { name: "Geri", exact: true }).click();
  const soru = page.getByRole("alertdialog");
  if (await soru.isVisible().catch(() => false)) await soru.getByRole("button", { name: "Kaydetme" }).click();
  await expect(page.getByRole("button", { name: "Aç", exact: true })).toBeVisible();
};

test("şablondan yeni belge, çalışma kitabı ve sunu @koyu", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Şablonlar" }).click();
  const liste = page.getByRole("dialog", { name: "Şablondan yeni" });
  await expect(liste.getByRole("list", { name: "Belge şablonları" }).getByRole("listitem")).toHaveText([/Mektup$/, /Özgeçmiş$/, /Rapor$/, /Toplantı Notları$/, /Dilekçe$/]);
  await expect(liste.getByRole("list", { name: "Tablo şablonları" }).getByRole("listitem")).toHaveCount(4);
  await expect(liste.getByRole("list", { name: "Sunum şablonları" }).getByRole("listitem")).toHaveCount(5);
  await liste.getByRole("button", { name: "Kapat" }).click();

  // (Başsız tarayıcı ASCII dışı indirme adını "download" yapar: kaydetme ASCII adlı şablonla denenir.)
  await sablon(page, "Rapor");
  await expect(page.locator(".m-appbar h1")).toHaveText("Rapor.docx");
  await expect(page.locator(".bl-body .ProseMirror")).not.toBeEmpty();
  await expect(page.getByRole("button", { name: "Geri al" })).toBeVisible();
  const d = await download(page, () => page.getByRole("button", { name: "Kaydet", exact: true }).click());
  expect(d.suggestedFilename()).toBe("Rapor.docx");
  await geriDon(page);

  await sablon(page, "Fatura");
  await expect(page.locator(".m-tablo-grid")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".m-appbar h1")).toHaveText("Fatura.xlsx");
  await expect(page.getByRole("tab", { selected: true })).not.toHaveText("Sayfa1");
  await geriDon(page);

  await sablon(page, "Eğitim");
  await expect(page.locator(".m-appbar h1")).toHaveText("Eğitim.pptx");
  await expect(page.locator(".m-sunum-seri .m-sunum-thumb").nth(1)).toBeVisible();
  await geriDon(page);
});
