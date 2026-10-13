// Slayt gösterisinde kalem araçları: kalem/vurgulayıcı çizer, silgi siler, lazer noktası gösterilir;
// araç seçiliyken dokunma ve kaydırma ilerletmez, oklarla gezinilir; mürekkep slayta özgüdür;
// geri önce araçları kapatır, sonra gösteriyi bitirir.
import { expect, test, type Page } from "@playwright/test";
import { fixture, openFile, start } from "./ortak";

const sayac = (page: Page) => page.locator(".m-sunum-show-ust span");
const yollar = (page: Page) => page.locator(".m-sunum-show .show-ink path");
const arac = (page: Page, ad: string) => page.getByRole("toolbar", { name: "Kalem araçları" }).getByRole("button", { name: ad, exact: true });

async function ciz(page: Page, x0: number, y0: number, dx: number) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + dx / 2, y0 + 20, { steps: 6 });
  await page.mouse.move(x0 + dx, y0, { steps: 6 });
  await page.mouse.up();
}

test("gösteride kalem, vurgulayıcı, silgi ve lazer @koyu", async ({ page }) => {
  await start(page);
  await openFile(page, fixture("sunum", "lo-proje.pptx"));
  await expect(page.locator(".m-sunum-kagit")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Oynat" }).click();
  await expect(sayac(page)).toHaveText("1 / 7");

  await page.getByRole("button", { name: "Kalem ve lazer işaretçisi" }).click();
  await expect(arac(page, "Kalem")).toHaveAttribute("aria-pressed", "true");
  const vp = page.viewportSize()!;
  const y = vp.height / 2;
  await ciz(page, 80, y - 30, 200);
  await expect(yollar(page)).toHaveCount(1);
  await expect(yollar(page).first()).toHaveAttribute("stroke", "#E81123");
  // Kalemle dokunma nokta koyar, ilerletmez
  await page.mouse.click(vp.width - 40, y);
  await expect(sayac(page)).toHaveText("1 / 7");
  await expect(yollar(page)).toHaveCount(2);

  // Vurgulayıcı, renk seçimi
  await arac(page, "Vurgulayıcı").click();
  await page.getByRole("radiogroup", { name: "Mürekkep rengi" }).getByRole("radio", { name: "Mavi" }).click();
  await ciz(page, 60, y + 20, 240);
  await expect(yollar(page)).toHaveCount(3);
  await expect(yollar(page).nth(2)).toHaveAttribute("stroke", "#0078D4");
  await expect(yollar(page).nth(2)).toHaveAttribute("stroke-opacity", "0.5");

  // Silgi: dokunulan çizgiler silinir (vurgu ve nokta)
  await arac(page, "Silgi").click();
  for (const [x, yy] of [
    [60 + 240, y + 20],
    [vp.width - 40, y],
  ]) {
    await page.mouse.move(x, yy);
    await page.mouse.down();
    await page.mouse.up();
  }
  await expect(yollar(page)).toHaveCount(1);

  // Lazer: basılıyken nokta görünür, ilerletmez
  await arac(page, "Lazer işaretçisi").click();
  await page.mouse.move(200, y);
  await page.mouse.down();
  await page.mouse.move(210, y + 5, { steps: 3 });
  await expect(page.locator(".m-sunum-show .show-laser")).toBeVisible();
  await page.mouse.up();
  await expect(sayac(page)).toHaveText("1 / 7");

  // Oklarla gezinme; mürekkep slayta özgü
  await arac(page, "Sonraki").click();
  await expect(sayac(page)).toHaveText("2 / 7");
  await expect(yollar(page)).toHaveCount(0);
  await arac(page, "Önceki").click();
  await expect(sayac(page)).toHaveText("1 / 7");
  await expect(yollar(page)).toHaveCount(1);
  await arac(page, "Slayttaki mürekkebi sil").click();
  await expect(yollar(page)).toHaveCount(0);

  // Araç çubuğu kapanınca dokunarak ilerleme döner
  await page.getByRole("button", { name: "Kalem ve lazer işaretçisi" }).click();
  await expect(page.getByRole("toolbar", { name: "Kalem araçları" })).toHaveCount(0);
  await page.mouse.click(vp.width - 40, y);
  await expect(sayac(page)).toHaveText("2 / 7");
  await page.getByRole("button", { name: "Gösteriyi bitir" }).click();
  await expect(page.locator(".m-sunum-show")).toHaveCount(0);
});
