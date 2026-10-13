// Otomatik kurtarma: kaydedilmemiş değişiklikler uygulama arka plana gidince taslak olarak saklanır;
// uygulama kapanıp (sayfa yeniden yüklenir) açılınca başlangıç ekranında önerilir, açılınca
// kaydedilmemiş olarak gelir; kaydedilince ya da vazgeçilince taslak silinir.
import { expect, test, type Page } from "@playwright/test";
import { download, newDoc, start } from "./ortak";

const kurtarilan = (page: Page) => page.getByRole("list", { name: "Kurtarılan dosyalar" });
const altSatir = (page: Page) => page.locator(".m-appbar-sub");

/** Uygulama arka plana gider (Android'de duraklatma) ve süreç sonlanır. */
async function arkaPlanVeKapat(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  // Taslak IndexedDB'ye yazılınca liste değişir; yazma bitene dek beklenir.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((r) => {
            const q = indexedDB.open("officehere-mobil", 1);
            q.onsuccess = () => {
              const t = q.result.transaction("taslaklar", "readonly").objectStore("taslaklar").count();
              t.onsuccess = () => r(t.result);
              t.onerror = () => r(-1);
            };
            q.onerror = () => r(-1);
          }),
      ),
    )
    .toBe(1);
  await page.reload();
}

test.describe("otomatik kurtarma", () => {
  test("Belge: yazılan metin kurtarılır; kaydedince taslak kalkar", async ({ page }) => {
    await start(page);
    await expect(kurtarilan(page)).toHaveCount(0);
    await newDoc(page, "belge");
    await page.locator(".bl-body .ProseMirror").click();
    await page.keyboard.type("Kurtarılacak satır: İğdır, Şişli.");
    await expect(altSatir(page)).toContainText("Kaydedilmedi");
    await arkaPlanVeKapat(page);

    await expect(kurtarilan(page).getByRole("listitem")).toHaveCount(1);
    await expect(kurtarilan(page)).toContainText("Belge1.docx");
    await expect(kurtarilan(page)).toContainText("Kaydedilmemiş değişiklikler");
    await kurtarilan(page).getByRole("button", { name: /^Belge1\.docx Kaydedilmemiş/ }).click();
    await expect(page.locator(".bl-body .ProseMirror")).toContainText("Kurtarılacak satır: İğdır, Şişli.");
    await expect(altSatir(page)).toContainText("Kaydedilmedi");
    await expect(page.locator(".m-belge-not")).toContainText("Kurtarılan taslak");

    const d = await download(page, () => page.getByRole("button", { name: "Kaydet", exact: true }).click());
    expect(d.suggestedFilename()).toBe("Belge1.docx");
    await expect(altSatir(page)).toContainText("Kaydedildi");
    await page.getByRole("button", { name: "Geri", exact: true }).click();
    await expect(page.getByRole("button", { name: "Aç", exact: true })).toBeVisible();
    await expect(kurtarilan(page)).toHaveCount(0);
  });

  test("Tablo: değer ve formül kurtarılır; geri ile vazgeçilince taslak silinir", async ({ page }) => {
    await start(page);
    await newDoc(page, "tablo");
    await expect(page.locator(".m-tablo-grid")).toBeVisible({ timeout: 30_000 });
    const fb = page.getByLabel("Formül çubuğu", { exact: true });
    await fb.click();
    for (const v of ["12", "30", "=TOPLA(A1:A2)"]) {
      await page.keyboard.type(v);
      await page.keyboard.press("Enter");
    }
    await expect(altSatir(page)).toContainText("Kaydedilmedi");
    await arkaPlanVeKapat(page);

    await kurtarilan(page).getByRole("button", { name: /^Kitap1\.xlsx Kaydedilmemiş/ }).click();
    await expect(page.locator(".m-tablo-grid")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".m-appbar h1")).toHaveText("Kitap1.xlsx");
    await expect(altSatir(page)).toContainText("Kaydedilmedi");
    await page.getByLabel("Ad Kutusu", { exact: true }).fill("A3");
    await page.getByLabel("Ad Kutusu", { exact: true }).press("Enter");
    await expect(page.getByRole("status", { name: "Hücre bilgisi" })).toHaveText("A3: 42");
    await expect(fb).toHaveValue("=TOPLA(A1:A2)");

    await page.getByRole("button", { name: "Geri", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Kaydetme" }).click();
    await expect(page.getByRole("button", { name: "Aç", exact: true })).toBeVisible();
    await expect(kurtarilan(page)).toHaveCount(0);
  });

  test("Sunum: yazılmakta olan metin kurtarılır; taslak silinebilir", async ({ page }) => {
    await start(page);
    await newDoc(page, "sunum");
    await page.getByText("Başlık eklemek için tıklayın", { exact: true }).click();
    await page.keyboard.type("Kurtarma denemesi");
    await arkaPlanVeKapat(page);

    await kurtarilan(page).getByRole("button", { name: /^Sunu1\.pptx Kaydedilmemiş/ }).click();
    await expect(page.locator(".m-sunum-kagit")).toContainText("Kurtarma denemesi");
    await expect(altSatir(page)).toContainText("Kaydedilmedi");
    // Ekran açıkken uygulama yine sonlanırsa taslak aynı kayıtta kalır.
    await arkaPlanVeKapat(page);
    await expect(kurtarilan(page).getByRole("listitem")).toHaveCount(1);

    await kurtarilan(page).getByRole("button", { name: "Sunu1.pptx taslağını sil" }).click();
    await page.getByRole("alertdialog", { name: "Taslak silinsin mi?" }).getByRole("button", { name: "Sil" }).click();
    await expect(kurtarilan(page)).toHaveCount(0);
  });
});
