// Belge gezinme ve erişilebilir biçimler: 90 sayfalık belgede başlık listesiyle (Gezinti) atlama ve sayfaya
// gitme, "kaldığın yerden devam" (okunan yer ve imleç belge başına saklanır, yeniden açılışta geri gelir),
// paragraf boşluğu, serbest punto, A5 kâğıt ve sayfa rengi (.docx kaydet-aç turunda korunur).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { download, fixture, newDoc, openFile, start } from "./ortak";

const UZUN = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/belge/uzun.docx");
const govde = (page: Page) => page.locator(".bl-body .ProseMirror");
const kaydirma = (page: Page) => page.locator(".bl-scroll");
const appbar = (page: Page) => page.locator(".m-appbar");
const basliklar = (page: Page) => page.getByRole("navigation", { name: "Başlıklar" });

interface Mobil {
  editor: { state: { selection: { anchor: number; head: number } } };
  controller: { info: { pageCount: number; pages: { w: number; h: number }[] } };
}
const mobil = <T,>(page: Page, fn: (m: Mobil) => T) => page.evaluate(`(${fn.toString()})(window.__belgeMobil)`) as Promise<T>;

/** Konsol/sayfa hataları toplanır; test sonunda boş olmalı. */
function hatalar(page: Page): string[] {
  const out: string[] = [];
  page.on("pageerror", (e) => out.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") out.push(m.text());
  });
  return out;
}

/** Uzun belgeyi açar; sayfalama bitene (90 sayfa) dek bekler. */
async function uzunAc(page: Page) {
  await openFile(page, UZUN);
  await expect(govde(page)).toBeVisible();
  await expect.poll(() => mobil(page, (m) => m.controller.info.pageCount), { timeout: 30_000 }).toBeGreaterThanOrEqual(90);
}

/**
 * Sayfa içinde süre ölçümü: dokunuştan (pointerdown) koşul sağlanana dek geçen süre (ms). Her karede
 * denetlenir; test sürücüsünün gecikmesi sayılmaz.
 */
async function sure(page: Page, kosul: string, eylem: () => Promise<void>): Promise<number> {
  await page.evaluate((k) => {
    const w = window as unknown as { __sure: Promise<number> };
    w.__sure = new Promise((bitti) => {
      let t0 = 0;
      addEventListener("pointerdown", () => (t0 = performance.now()), { capture: true, once: true });
      const kare = () => (t0 && (0, eval)(k) ? bitti(performance.now() - t0) : requestAnimationFrame(kare));
      kare();
    });
  }, kosul);
  await eylem();
  return page.evaluate(() => (window as unknown as { __sure: Promise<number> }).__sure);
}

/** Başlık kaydırma alanının üstünde mi (0-30 px)? Sayfada çalışan ifade. */
const basliktaMi = (n: number) =>
  `(() => { const h = [...document.querySelectorAll(".bl-body h1")].find((x) => x.textContent === "Bölüm ${n}"); const s = document.querySelector(".bl-scroll"); if (!h || !s) return false; const d = h.getBoundingClientRect().top - s.getBoundingClientRect().top; return d >= 0 && d < 30; })()`;

/** Öğenin kaydırma alanının üstüne uzaklığı (px). */
async function ustUzaklik(page: Page, el: Locator): Promise<number> {
  const a = (await el.boundingBox())!;
  const b = (await kaydirma(page).boundingBox())!;
  return a.y - b.y;
}

/** İmlecin bulunduğu metin bloğunun içeriği. */
const imlecBasligi = (page: Page) => page.evaluate(() => (window as unknown as { __belgeMobil: { editor: { state: { selection: { $from: { parent: { textContent: string } } } } } } }).__belgeMobil.editor.state.selection.$from.parent.textContent);

const bolum = (page: Page, n: number) => govde(page).locator("h1", { hasText: new RegExp(`^Bölüm ${n}$`) });

test.describe("Belge gezinme", () => {
  let errors: string[] = [];
  test.beforeEach(async ({ page }) => {
    errors = hatalar(page);
    await start(page);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test("90 sayfalık belgede başlık listesi 1 sn içinde açılır ve atlar; sayfaya, başa ve sona git", async ({ page }) => {
    await uzunAc(page);
    const dugme = page.getByRole("button", { name: "Gezinti", exact: true });

    const acilis = await sure(page, `document.querySelectorAll('nav[aria-label="Başlıklar"] button').length === 135`, () => dugme.click());
    await expect(basliklar(page).getByRole("button")).toHaveCount(135);
    // Belgenin başında ilk başlık işaretli
    await expect(basliklar(page).getByRole("button", { name: "Bölüm 1", exact: true })).toHaveAttribute("aria-current", "location");

    const atlama = await sure(page, basliktaMi(40), () => basliklar(page).getByRole("button", { name: "Bölüm 40", exact: true }).click());
    await expect(page.getByRole("dialog", { name: "Gezinti" })).toHaveCount(0);
    expect(await ustUzaklik(page, bolum(page, 40))).toBeLessThan(30);
    expect(await ustUzaklik(page, bolum(page, 40))).toBeGreaterThanOrEqual(0);
    const sayfaSayisi = await mobil(page, (m) => m.controller.info.pageCount);
    test.info().annotations.push({ type: "ölçüm", description: `${sayfaSayisi} sayfa, 135 başlık: liste ${Math.round(acilis)} ms'de açıldı, atlama ${Math.round(atlama)} ms` });
    expect(acilis).toBeLessThan(1000);
    expect(atlama).toBeLessThan(1000);
    // Klavye açılmaz (düzenleyiciye odaklanılmaz); imleç başlığın başında
    await expect(govde(page)).not.toBeFocused();

    // Yeniden açılınca bulunulan bölüm işaretli; sayfaya git
    await dugme.click();
    await expect(basliklar(page).getByRole("button", { name: "Bölüm 40", exact: true })).toHaveAttribute("aria-current", "location");
    const sayfaNo = page.getByRole("textbox", { name: "Sayfa" });
    await expect(sayfaNo).toHaveAttribute("placeholder", /^\d+$/);
    await sayfaNo.fill("60");
    await sayfaNo.press("Enter");
    await expect.poll(() => ustUzaklik(page, page.locator('.bl-page[data-page="59"]'))).toBeLessThan(30);
    expect(await ustUzaklik(page, page.locator('.bl-page[data-page="59"]'))).toBeGreaterThan(0);

    // Sona ve başa git
    await dugme.click();
    await page.getByRole("button", { name: "Sona git" }).click();
    await expect.poll(() => kaydirma(page).evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop)).toBeLessThan(2);
    await dugme.click();
    await page.getByRole("button", { name: "Başa git" }).click();
    await expect.poll(() => kaydirma(page).evaluate((e) => e.scrollTop)).toBe(0);
  });

  test("kısa belgede ve mobil görünümde de başlıklarla atlanır; düzenleme kipinde araç çubuğundan", async ({ page }) => {
    await openFile(page, fixture("belge", "bicimler/lo-ornek.docx"));
    await expect(govde(page)).toBeVisible();
    await page.getByRole("button", { name: "Mobil görünüm", exact: true }).click();
    await expect(page.locator(".bl-workspace.is-web")).toBeVisible();
    await page.getByRole("button", { name: "Gezinti", exact: true }).click();
    await expect(basliklar(page).getByRole("button")).toHaveText(["Giriş ve Amaç", "Tablo ve Resim"]);
    // Sayfaya git yalnız sayfa düzeninde
    await expect(page.getByRole("textbox", { name: "Sayfa" })).toHaveCount(0);
    await basliklar(page).getByRole("button", { name: "Tablo ve Resim" }).click();
    // Kısa belge başlığı en üste getirecek kadar kaymaz: görünür olur, imleç başlıkta
    await expect(govde(page).locator("h2")).toBeInViewport();
    expect(await imlecBasligi(page)).toBe("Tablo ve Resim");

    // Düzenleme kipinde araç çubuğundaki Gezinti; klavye kapanır, atlayınca açılmaz
    await page.getByRole("button", { name: "Sayfa düzeni", exact: true }).click();
    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    await expect(govde(page)).toBeFocused();
    await page.getByRole("navigation", { name: "Biçimlendirme" }).getByRole("button", { name: "Gezinti" }).click();
    await expect(govde(page)).not.toBeFocused();
    await basliklar(page).getByRole("button", { name: "Giriş ve Amaç" }).click();
    await expect(govde(page)).not.toBeFocused();
    await expect(govde(page).locator("h1")).toBeInViewport();
    expect(await imlecBasligi(page)).toBe("Giriş ve Amaç");
    await expect(appbar(page)).toContainText("Kaydedildi");
  });

  test("kaldığın yerden devam: okunan yer ve imleç yeniden açılışta (uygulama yeniden başlasa da) geri gelir", async ({ page }) => {
    await uzunAc(page);
    // Belge başta açılır (kayıtlı yer yok)
    expect(await kaydirma(page).evaluate((e) => e.scrollTop)).toBe(0);
    await page.getByRole("button", { name: "Gezinti", exact: true }).click();
    await basliklar(page).getByRole("button", { name: "Bölüm 30", exact: true }).click();
    await expect.poll(() => ustUzaklik(page, bolum(page, 30))).toBeLessThan(30);
    // Biraz daha okunur, bir paragrafa dokunulup imleç konur
    await kaydirma(page).evaluate((e) => (e.scrollTop += 400));
    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    // Düzenlemeye geçince imleç görünen yerin başına konur; dokunulan yere taşınması beklenir
    await expect(govde(page)).toBeFocused();
    const ilk = await mobil(page, (m) => m.editor.state.selection.head);
    const sb = (await kaydirma(page).boundingBox())!;
    await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await expect.poll(() => mobil(page, (m) => m.editor.state.selection.head)).toBeGreaterThan(ilk);
    const secim = await mobil(page, (m) => ({ anchor: m.editor.state.selection.anchor, head: m.editor.state.selection.head }));
    const uzaklik = await ustUzaklik(page, bolum(page, 30));
    expect(uzaklik).toBeLessThan(-300);
    await page.getByRole("button", { name: "Düzenlemeyi bitir" }).click();
    await page.getByRole("button", { name: "Geri", exact: true }).click();
    await expect(page.getByRole("button", { name: "Aç", exact: true })).toBeVisible();

    // Uygulama yeniden başlar (süreç sonlandı); aynı belge açılınca kalınan yere gidilir
    await page.reload();
    await uzunAc(page);
    await expect(page.locator(".m-toast").filter({ hasText: "Kaldığınız yerden devam ediliyor." })).toBeVisible();
    await expect.poll(async () => Math.abs((await ustUzaklik(page, bolum(page, 30))) - uzaklik)).toBeLessThan(30);
    expect(await mobil(page, (m) => ({ anchor: m.editor.state.selection.anchor, head: m.editor.state.selection.head }))).toEqual({ anchor: secim.anchor, head: secim.head });
    // Düzenlemeye geçince imleç kalınan yerde (görünür olduğu için yerinde kalır)
    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    await expect(govde(page)).toBeFocused();
    expect(await mobil(page, (m) => m.editor.state.selection.head)).toBe(secim.head);

    // Başka bir belge kalınan yeri etkilemez; yeni belgede yer saklanmaz
    await page.getByRole("button", { name: "Düzenlemeyi bitir" }).click();
    await page.getByRole("button", { name: "Geri", exact: true }).click();
    await newDoc(page, "belge");
    await expect(govde(page)).toBeFocused();
    expect(await kaydirma(page).evaluate((e) => e.scrollTop)).toBe(0);
  });

  test("paragraf boşluğu, serbest punto, A5 ve sayfa rengi; .docx kaydet-aç turunda korunur", async ({ page }) => {
    await newDoc(page, "belge");
    await expect(govde(page)).toBeFocused();
    await page.keyboard.type("Birinci paragraf");
    await page.keyboard.press("Enter");
    await page.keyboard.type("İkinci paragraf");

    // Paragraf aralığı: önce 0 → 12 nk, sonra 8 (Normal stil) → 6 nk
    await page.getByRole("button", { name: "Paragraf ve hizalama", exact: true }).click();
    const paragraf = page.getByRole("dialog", { name: "Paragraf" });
    await expect(paragraf.getByLabel("Önce boşluğu", { exact: true })).toHaveText("0 nk");
    await expect(paragraf.getByLabel("Sonra boşluğu", { exact: true })).toHaveText("8 nk");
    await paragraf.getByRole("button", { name: "Önce boşluğu artır" }).click();
    await paragraf.getByRole("button", { name: "Önce boşluğu artır" }).click();
    await paragraf.getByRole("button", { name: "Sonra boşluğu azalt" }).click();
    await expect(paragraf.getByLabel("Önce boşluğu", { exact: true })).toHaveText("12 nk");
    await expect(paragraf.getByLabel("Sonra boşluğu", { exact: true })).toHaveText("6 nk");
    await paragraf.getByRole("button", { name: "Kapat" }).click();
    const ikinci = govde(page).locator("p", { hasText: "İkinci paragraf" });
    await expect(ikinci).toHaveCSS("margin-top", "16px");
    await expect(ikinci).toHaveCSS("margin-bottom", "8px");

    // Serbest punto: listede olmayan 13,5
    await page.keyboard.press("Shift+Home");
    await page.getByRole("button", { name: "Yazı tipi", exact: true }).click();
    const punto = page.getByRole("dialog", { name: "Yazı tipi" }).getByLabel("Yazı tipi boyutu");
    await expect(punto).toHaveValue("11");
    await punto.fill("13,5");
    await punto.press("Enter");
    await expect(punto).toHaveValue("13,5");
    await expect(ikinci.locator("span[style*='13.5pt']")).toHaveText("İkinci paragraf");
    // Geçersiz boyut uygulanmaz
    await punto.fill("2000");
    await punto.press("Enter");
    await expect(page.locator(".m-toast")).toContainText("1 ile 1638");
    await expect(punto).toHaveValue("13,5");
    await page.getByRole("dialog", { name: "Yazı tipi" }).getByRole("button", { name: "Kapat" }).click();

    // Sayfa yapısı: A5 ve sayfa rengi
    await page.getByRole("button", { name: "Sayfa yapısı", exact: true }).click();
    const sayfa = page.getByRole("dialog", { name: "Sayfa yapısı" });
    await expect(sayfa.getByRole("button", { name: /^A4 / })).toHaveAttribute("aria-pressed", "true");
    await sayfa.getByRole("button", { name: /^A5 / }).click();
    await expect(sayfa.getByRole("button", { name: /^A5 / })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => mobil(page, (m) => Math.round(m.controller.info.pages[0].w))).toBe(559);
    await sayfa.getByRole("button", { name: "#FFC000" }).click();
    await expect(page.locator(".bl-page").first()).toHaveCSS("background-color", "rgb(255, 192, 0)");
    await sayfa.getByRole("button", { name: "Kapat" }).click();

    const d = await download(page, () => page.getByRole("button", { name: "Kaydet", exact: true }).click());
    await expect(appbar(page)).toContainText("Kaydedildi");
    const buffer = readFileSync(await d.path());
    await page.getByRole("button", { name: "Geri", exact: true }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Aç", exact: true }).click();
    await (await chooser).setFiles({ name: d.suggestedFilename(), mimeType: "application/octet-stream", buffer });
    await expect(govde(page)).toBeVisible();
    await expect.poll(() => mobil(page, (m) => Math.round(m.controller.info.pages[0].w))).toBe(559);
    await expect(page.locator(".bl-page").first()).toHaveCSS("background-color", "rgb(255, 192, 0)");
    await expect(ikinci).toHaveCSS("margin-top", "16px");
    await expect(ikinci.locator("span[style*='13.5pt']")).toHaveText("İkinci paragraf");

    // Yalnız sayfa rengini kaldırmak da belgeyi kaydedilmemiş yapar
    await expect(appbar(page)).toContainText("Kaydedildi");
    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    await page.getByRole("button", { name: "Daha fazla", exact: true }).click();
    await page.getByRole("dialog", { name: "Diğer" }).getByRole("button", { name: /Sayfa yapısı/ }).click();
    await page.getByRole("dialog", { name: "Sayfa yapısı" }).getByRole("button", { name: "Renk yok" }).click();
    await expect(page.locator(".bl-page").first()).not.toHaveCSS("background-color", "rgb(255, 192, 0)");
    await expect(appbar(page)).toContainText("Kaydedilmedi");
  });
});
