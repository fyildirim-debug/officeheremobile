// Belge ekranı: açma (tüm biçimler), sayfa/mobil görünüm, düzenleme, nesne koruması, bul, kaydetme ve geri.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Download, type Page } from "@playwright/test";
import { download, fixture, newDoc, openFile, start } from "./ortak";

const govde = (page: Page) => page.locator(".bl-body .ProseMirror");
const bicimler = (ad: string) => fixture("belge", `bicimler/${ad}`);
const appbar = (page: Page) => page.locator(".m-appbar");
/** Bu deponun örnek dosyaları (e2e/fixtures/belge/uret.mjs ile masaüstü yazıcısından üretilir). */
const ornek = (ad: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/belge", ad);

/** Konsol/sayfa hataları toplanır; test sonunda boş olmalı. */
function hatalar(page: Page): string[] {
  const out: string[] = [];
  page.on("pageerror", (e) => out.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") out.push(m.text());
  });
  return out;
}

/** Düzenleyici seçiminin tarayıcıdan okunmasını bekler (seçim olayı eşzamansız gelir). */
async function secimBekle(page: Page, bos: boolean) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { __belgeMobil: { editor: { state: { selection: { empty: boolean } } } } }).__belgeMobil.editor.state.selection.empty)).toBe(bos);
}

async function ac(page: Page, dosya: string) {
  await openFile(page, dosya);
  await expect(govde(page)).toBeVisible();
}

/** İndirilen dosyayı yeniden açar (Türkçe karakterli yollar dosya seçicide sorun çıkarır; bayt verilir). */
async function indirileniAc(page: Page, d: Download) {
  const buffer = readFileSync(await d.path());
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Aç", exact: true }).click();
  await (await chooser).setFiles({ name: d.suggestedFilename(), mimeType: "application/octet-stream", buffer });
  await expect(govde(page)).toBeVisible();
}

test.describe("Belge", () => {
  let errors: string[] = [];
  test.beforeEach(async ({ page }) => {
    errors = hatalar(page);
    await start(page);
  });
  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test("yeni belge: yaz, kalın uygula, .docx kaydet; yeniden açınca metin ve kalın korunur", async ({ page }) => {
    await newDoc(page, "belge");
    await expect(govde(page)).toBeFocused();
    await expect(appbar(page)).toContainText("Belge1.docx");
    await expect(page.getByRole("navigation", { name: "Biçimlendirme" })).toBeVisible();
    await page.keyboard.type("Merhaba dünya");
    await expect(appbar(page)).toContainText("Kaydedilmedi");
    for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowLeft");
    await secimBekle(page, false);
    const kalin = page.getByRole("button", { name: "Kalın", exact: true });
    await kalin.click();
    await expect(govde(page).locator("strong")).toHaveText("dünya");
    await expect(kalin).toHaveAttribute("aria-pressed", "true");

    const d = await download(page, () => page.getByRole("button", { name: "Kaydet", exact: true }).click());
    expect(d.suggestedFilename()).toBe("Belge1.docx");
    await expect(appbar(page)).toContainText("Kaydedildi");

    // Kaydedildiği için geri soru sormadan kapanır; dosya yeniden açılır.
    await page.getByRole("button", { name: "Geri", exact: true }).click();
    await indirileniAc(page, d);
    await expect(govde(page)).toContainText("Merhaba dünya");
    await expect(govde(page).locator("strong")).toHaveText("dünya");
    // Açılan belge görüntüleme kipinde: düzenlenemez, araç çubuğu yok.
    await expect(govde(page)).toHaveAttribute("contenteditable", "false");
    await expect(page.getByRole("navigation", { name: "Biçimlendirme" })).toHaveCount(0);
  });

  for (const ext of ["docx", "odt", "rtf", "doc"] as const) {
    test(`.${ext} açılır: başlıklar, biçim, tablo, resim, üst bilgi sayfada görünür`, async ({ page }) => {
      await ac(page, bicimler(`lo-ornek.${ext}`));
      await expect(appbar(page)).toContainText(`lo-ornek.${ext}`);
      await expect(govde(page).locator("h1")).toHaveText("Giriş ve Amaç");
      await expect(govde(page).locator("h2")).toHaveText("Tablo ve Resim");
      await expect(govde(page).locator("strong", { hasText: "kalın" })).toBeVisible();
      await expect(govde(page)).toContainText("Türkçe: İĞÜŞÖÇ ığüşöç.");
      await expect(govde(page).locator("table td")).toHaveCount(7);
      await expect(govde(page).locator("table td[colspan='2']")).toHaveText("Yatay birleşik hücre");
      await expect(govde(page).locator("img[src^='data:image']").first()).toBeVisible();
      // Sayfa düzeni: masaüstündeki gibi sayfalar, üst bilgi ve dipnot; sayfa ekran genişliğine sığar.
      await expect(page.locator(".bl-pages > .bl-page")).toHaveCount(2);
      await expect(page.locator(".bl-hf-header").first()).toContainText("Üst bilgi");
      await expect(page.locator(".bl-footnotes").first()).toContainText("Dipnot");
      const sayfa = await page.locator(".bl-page").first().boundingBox();
      const ekran = page.viewportSize()!;
      expect(sayfa!.width).toBeLessThanOrEqual(ekran.width);
      expect(sayfa!.width).toBeGreaterThan(ekran.width * 0.85);
      if (ext === "doc") {
        await expect(page.locator(".m-belge-not")).toContainText("Uyumluluk modu");
        await expect(page.locator(".m-belge-not")).not.toContainText("Word");
      } else await expect(page.locator(".m-belge-not")).toHaveCount(0);
      await expect(govde(page)).toHaveAttribute("contenteditable", "false");
    });
  }

  test(".md açılır: başlık, liste, tablo ve kod Markdown'dan çözülür", async ({ page }) => {
    await ac(page, bicimler("ornek.md"));
    await expect(govde(page).locator("h1")).toHaveText("Ana Başlık İĞÜŞÖÇ");
    await expect(govde(page).locator("ul > li").first()).toContainText("Birinci madde");
    await expect(govde(page).locator("table tr")).toHaveCount(3);
    await expect(govde(page)).not.toContainText("**");
  });

  test("tablo yalnız görüntülenir: hücreye yazılamaz, hücrede biçim uygulanamaz", async ({ page }) => {
    await ac(page, bicimler("lo-ornek.docx"));
    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    await expect(govde(page)).toHaveAttribute("contenteditable", "true");
    await expect(page.locator(".bl-body .tableWrapper").first()).toHaveAttribute("contenteditable", "false");
    const hucre = govde(page).locator("td", { hasText: "Ayşe" });
    await hucre.click();
    await page.keyboard.type("XYZ");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Backspace");
    // İmleç doğrudan hücreye konsa da (ör. arama sonucu) yazılamaz.
    await page.evaluate(() => {
      const ed = (window as unknown as { __belgeMobil: { editor: { state: { doc: { descendants: (f: (n: { isText: boolean; text?: string }, pos: number) => boolean) => void } }; commands: { setTextSelection: (p: number) => void; insertContent: (s: string) => void; focus: () => void } } } }).__belgeMobil.editor;
      let at = -1;
      ed.state.doc.descendants((n, pos) => {
        if (at < 0 && n.isText && n.text === "Ayşe") at = pos + 2;
        return at < 0;
      });
      ed.commands.setTextSelection(at);
      ed.commands.insertContent("Q");
    });
    await expect(hucre).toHaveText("Ayşe");
    await page.getByRole("button", { name: "Kalın", exact: true }).click();
    await expect(page.locator(".m-toast")).toContainText("yalnız görüntülenir");
    await expect(hucre.locator("strong")).toHaveCount(0);
    await expect(govde(page).locator("table td")).toHaveCount(7);
    await expect(appbar(page)).toContainText("Kaydedildi");
    // Masaüstü tutamaçları mobilde görünmez.
    for (const sel of [".bl-tbl-move", ".bl-tbl-resize", "[data-resize-handle]"]) {
      for (const el of await page.locator(sel).all()) await expect(el).toBeHidden();
    }
  });

  test("metin kutusu, denklem, grafik, resim görünür; içleri ve boyutları değişmez, üzerine yazılamaz", async ({ page }) => {
    await ac(page, ornek("nesneler.docx"));
    await expect(govde(page).locator(".bl-chart svg")).toBeVisible();
    await expect(govde(page).locator(".bl-eq")).toBeVisible();
    await expect(govde(page).locator(".bl-textbox")).toContainText("Kutu içi metin");
    await expect(govde(page).locator("img[src^='data:image']")).toBeVisible();
    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    // Resme dokunup yazmak resmi silmez.
    await govde(page).locator("img[src^='data:image']").click();
    await page.keyboard.type("XY");
    await expect(govde(page).locator("img[src^='data:image']")).toHaveCount(1);
    // Metin kutusuna ve grafiğe yazılamaz.
    await govde(page).locator(".bl-textbox").getByText("Kutu içi metin").click();
    await page.keyboard.type("Z");
    await expect(govde(page).locator(".bl-textbox")).toHaveText("Kutu içi metin");
    await govde(page).locator(".bl-chart").click();
    await page.keyboard.type("Q");
    await expect(govde(page).locator(".bl-chart svg")).toHaveCount(1);
    await expect(govde(page)).not.toContainText(/XY|Q/);
    await expect(appbar(page)).toContainText("Kaydedildi");
    // Boyutlandırma tutamaçları görünmez.
    for (const sel of ["[data-resize-handle]", ".bl-chart-h", ".bl-tb-h", ".bl-tb-edge"]) {
      for (const el of await page.locator(sel).all()) await expect(el).toBeHidden();
    }
  });

  test("mobil görünüm: metin ekrana akar, sayfa yok; tercih hatırlanır; görünüm panelinde yakınlaştırma", async ({ page }) => {
    await ac(page, bicimler("lo-ornek.docx"));
    await expect(page.locator(".bl-page")).toHaveCount(2);
    await page.getByRole("button", { name: "Mobil görünüm", exact: true }).click();
    await expect(page.locator(".bl-workspace.is-web")).toBeVisible();
    await expect(page.locator(".bl-page")).toHaveCount(0);
    // Metin ekran genişliğine sığar (yatay kaydırma yok).
    const genis = await page.locator(".bl-scroll").evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
    expect(genis).toBe(true);
    await expect(govde(page)).toContainText("Türkçe: İĞÜŞÖÇ ığüşöç.");

    // Görünüm panelinden geri sayfa düzenine ve yakınlaştırma.
    await page.getByRole("button", { name: "Daha fazla", exact: true }).click();
    await page.getByRole("button", { name: "Görünüm", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Görünüm" });
    await panel.getByRole("button", { name: /Sayfa düzeni/ }).click();
    await expect(page.locator(".bl-page")).toHaveCount(2);
    const once = (await page.locator(".bl-page").first().boundingBox())!.width;
    await panel.getByRole("button", { name: "Yakınlaştır", exact: true }).click();
    await expect.poll(async () => (await page.locator(".bl-page").first().boundingBox())!.width).toBeGreaterThan(once * 1.1);
    await panel.getByRole("button", { name: "Sayfa genişliği", exact: true }).click();
    await expect.poll(async () => Math.round((await page.locator(".bl-page").first().boundingBox())!.width)).toBe(Math.round(once));
    await panel.getByRole("button", { name: /Mobil görünüm/ }).click();
    await expect(page.locator(".bl-page")).toHaveCount(0);
    await panel.getByRole("button", { name: "Kapat" }).click();

    // Tercih sonraki açılışta da geçerli.
    await page.getByRole("button", { name: "Geri", exact: true }).click();
    await ac(page, bicimler("lo-ornek.odt"));
    await expect(page.locator(".bl-workspace.is-web")).toBeVisible();
  });

  test("bul: eşleşmeler vurgulanır ve sayılır; değiştir yalnız tablo dışında", async ({ page }) => {
    await ac(page, bicimler("lo-ornek.docx"));
    await page.getByRole("button", { name: "Bul", exact: true }).click();
    const giris = page.getByRole("searchbox", { name: "Bul" });
    await expect(giris).toBeFocused();
    await giris.fill("MADDE");
    await expect(page.locator(".bl-hit")).toHaveCount(3);
    await expect(page.locator(".m-belge-bul-sayac")).toHaveText("1/3");
    await page.getByRole("button", { name: "Sonraki", exact: true }).click();
    await expect(page.locator(".m-belge-bul-sayac")).toHaveText("2/3");
    await expect(page.locator(".bl-hit.is-current")).toHaveCount(1);
    await page.getByRole("button", { name: "Bulmayı kapat", exact: true }).click();
    await expect(page.locator(".bl-hit")).toHaveCount(0);

    // Düzenleme kipinde tümünü değiştir: tablodaki eşleşme atlanır.
    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    await page.getByRole("button", { name: "Bul ve değiştir", exact: true }).click();
    await page.getByRole("searchbox", { name: "Bul" }).fill("birleşik");
    await expect(page.locator(".bl-hit")).toHaveCount(2);
    await page.getByRole("button", { name: "Değiştir", exact: true }).click();
    await page.getByRole("textbox", { name: "Yeni metin" }).fill("ortak");
    await page.getByRole("button", { name: "Tümü", exact: true }).click();
    await expect(page.locator(".m-toast")).toContainText("atlandı");
    await expect(govde(page).locator("td", { hasText: "Dikey birleşik" })).toHaveCount(1);
  });

  test("geri: kaydedilmemiş değişiklikte soru (Vazgeç / Kaydetme / Kaydet)", async ({ page }) => {
    await newDoc(page, "belge");
    await expect(govde(page)).toBeFocused();
    await page.keyboard.type("Kaydedilmemiş metin");
    await page.getByRole("button", { name: "Geri", exact: true }).click();
    const soru = page.getByRole("alertdialog");
    await expect(soru).toContainText("kaydedilsin mi");
    await expect(soru.getByRole("button")).toHaveText(["Kaydet", "Kaydetme", "Vazgeç"]);
    await soru.getByRole("button", { name: "Vazgeç" }).click();
    await expect(govde(page)).toContainText("Kaydedilmemiş metin");

    // Geri alınınca belge yeniden temiz sayılır.
    const geriAl = page.getByRole("button", { name: "Geri al", exact: true });
    for (let i = 0; i < 10 && (await geriAl.isEnabled()); i++) await geriAl.click();
    await expect(govde(page)).not.toContainText("Kaydedilmemiş");
    await expect(geriAl).toBeDisabled();

    await govde(page).click();
    await page.keyboard.type("Yeni");
    await page.getByRole("button", { name: "Geri", exact: true }).click();
    const d = await download(page, () => page.getByRole("alertdialog").getByRole("button", { name: "Kaydet", exact: true }).click());
    expect(d.suggestedFilename()).toBe("Belge1.docx");
    await expect(page.getByRole("button", { name: "Aç", exact: true })).toBeVisible();
  });

  test(".doc kaydedilince .docx olur; farklı kaydet ve paylaş biçim seçer; belge bilgisi", async ({ page }) => {
    await ac(page, bicimler("lo-ornek.doc"));
    await page.getByRole("button", { name: "Düzenle", exact: true }).click();
    await page.keyboard.type("Ek ");
    const d = await download(page, () => page.getByRole("button", { name: "Kaydet", exact: true }).click());
    expect(d.suggestedFilename()).toBe("lo-ornek.docx");
    await expect(page.locator(".m-toast")).toContainText(".doc");
    await expect(appbar(page)).toContainText("lo-ornek.docx");

    await page.getByRole("button", { name: "Daha fazla", exact: true }).click();
    await page.getByRole("button", { name: "Farklı kaydet", exact: true }).click();
    const f = await download(page, () => page.getByRole("button", { name: /OpenDocument Metin/ }).click());
    expect(f.suggestedFilename()).toBe("lo-ornek.odt");
    await expect(appbar(page)).toContainText("lo-ornek.odt");

    await page.getByRole("button", { name: "Daha fazla", exact: true }).click();
    const s = await download(page, () => page.getByRole("button", { name: "Paylaş", exact: true }).click());
    expect(s.suggestedFilename()).toBe("lo-ornek.odt");

    await page.getByRole("button", { name: "Daha fazla", exact: true }).click();
    await page.getByRole("button", { name: "Belge bilgisi", exact: true }).click();
    const bilgi = page.getByRole("dialog", { name: "Belge bilgisi" });
    await expect(bilgi).toContainText("Sözcük");
    await expect(bilgi).toContainText("Sayfa");
    await expect(bilgi.locator("dd").nth(2)).toHaveText("2");
  });

  test("biçim panelleri: stil, yazı boyutu, renk ve hizalama seçimle durumu yansıtır", async ({ page }) => {
    await newDoc(page, "belge");
    await expect(govde(page)).toBeFocused();
    await page.keyboard.type("Başlık metni");
    await page.getByRole("button", { name: "Stiller", exact: true }).click();
    await page.getByRole("option", { name: "Başlık 1" }).click();
    await expect(govde(page).locator("h1")).toHaveText("Başlık metni");
    await expect(page.getByRole("option", { name: "Başlık 1" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Kapat" }).click();

    await page.keyboard.press("Shift+Home");
    await secimBekle(page, false);
    await page.getByRole("button", { name: "Yazı tipi rengi", exact: true }).click();
    await page.getByRole("button", { name: "#C00000" }).click();
    await expect(govde(page).locator("h1 span[style*='color']")).toHaveCount(1);
    await page.getByRole("button", { name: "Kapat" }).click();

    await page.getByRole("button", { name: "Paragraf ve hizalama", exact: true }).click();
    await page.getByRole("button", { name: "Ortala", exact: true }).click();
    await expect(govde(page).locator("h1")).toHaveCSS("text-align", "center");
    await expect(page.getByRole("button", { name: "Ortala", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Kapat" }).click();

    await page.getByRole("button", { name: "Yazı tipi", exact: true }).click();
    await page.getByRole("option", { name: "18" }).click();
    // Boyut kutusu yazılabilir (serbest punto); seçilen boyutu gösterir
    await expect(page.getByLabel("Yazı tipi boyutu")).toHaveValue("18");
    await page.getByRole("option", { name: "Georgia" }).click();
    await expect(govde(page).locator("h1 span[style*='Georgia']")).toHaveCount(1);
    await page.getByRole("button", { name: "Kapat" }).click();

    await page.getByRole("button", { name: "Madde işaretleri", exact: true }).click();
    await expect(govde(page).locator("ul li")).toHaveCount(1);
  });

  test("koyu tema: sayfa zemini koyu, metin açık; ekrandan çıkınca öznitelik kalkar @koyu", async ({ page }) => {
    const koyu = await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches);
    await ac(page, bicimler("lo-ornek.docx"));
    await expect(page.locator(".bl-page").first()).toBeVisible();
    // Hesaplanan renk (oklch vb. olabilir) tuvalde sRGB'ye çevrilip göreli parlaklığı alınır.
    const parlaklik = (sel: string, ozellik: "backgroundColor" | "webkitTextFillColor") =>
      page.locator(sel).first().evaluate((e, oz) => {
        const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
        c.fillStyle = "#808080";
        c.fillStyle = getComputedStyle(e)[oz] as string;
        c.fillRect(0, 0, 1, 1);
        const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      }, ozellik);
    const zemin = await parlaklik(".bl-page", "backgroundColor");
    const metin = await parlaklik(".bl-body .ProseMirror p", "webkitTextFillColor");
    if (koyu) {
      await expect(page.locator("html")).toHaveAttribute("data-bl-page", "dark");
      expect(zemin).toBeLessThan(0.2);
      expect(metin).toBeGreaterThan(0.7);
      // Vurgulu metin kâğıttaki gibi koyu kalır; belgedeki renk değişmez (yalnız ekranda).
      const vurgulu = govde(page).locator("span[style*='background']", { hasText: "vurgulu" });
      expect(await vurgulu.evaluate((e) => getComputedStyle(e).webkitTextFillColor)).toBe("rgb(0, 0, 0)");
      await expect(govde(page).locator("strong", { hasText: "kalın" })).toHaveCSS("color", "rgb(0, 0, 0)");
    } else {
      expect(zemin).toBeGreaterThan(0.95);
      expect(metin).toBeLessThan(0.2);
    }
    await page.getByRole("button", { name: "Geri", exact: true }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-bl-page", "dark");
  });

  test("kendi zemin rengi olan sayfa koyu temada da kendi renginde kalır @koyu", async ({ page }) => {
    await ac(page, ornek("sayfa-rengi.docx"));
    await expect(page.locator(".bl-page").first()).toHaveCSS("background-color", "rgb(255, 242, 204)");
    // Metin kâğıt rengine göre (koyu) çizilir.
    const dolgu = await govde(page).locator("p").first().evaluate((e) => getComputedStyle(e).webkitTextFillColor);
    expect(dolgu).toBe("rgb(0, 0, 0)");
  });

  test("koyu temada açık dolgular ve grafik koyulaşır, belirgin dolgular ve seri renkleri kalır; açık temada değişmez @koyu", async ({ page }) => {
    const koyu = await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches);
    /** Öğenin hesaplanan rengi (oklch vb. olabilir) tuvalde sRGB'ye çevrilir: [parlaklık, "r,g,b"]. */
    const renk = (sel: string, oz: "backgroundColor" | "webkitTextFillColor" | "fill") =>
      page.locator(sel).first().evaluate((e, o) => {
        const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
        c.fillStyle = "#808080";
        c.fillStyle = getComputedStyle(e)[o] as string;
        c.fillRect(0, 0, 1, 1);
        const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
        return { L: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, rgb: `${r},${g},${b}` };
      }, oz);
    const koyuMu = async (sel: string, oz: "backgroundColor" | "fill" = "backgroundColor") => expect((await renk(sel, oz)).L).toBeLessThan(0.25);
    const acikMetin = async (sel: string) => expect((await renk(sel, "webkitTextFillColor")).L).toBeGreaterThan(0.6);

    // Grafik ve pastel dolgulu metin kutusu.
    await ac(page, ornek("nesneler.docx"));
    await expect(govde(page).locator(".bl-chart svg")).toBeVisible();
    const grafikZemin = ".bl-body .bl-chart svg > rect:first-child";
    const seri = '.bl-body .bl-chart svg rect[fill="#156082"]';
    expect((await renk(seri, "fill")).rgb).toBe("21,96,130");
    if (koyu) {
      await koyuMu(grafikZemin, "fill");
      expect((await renk('.bl-body .bl-chart svg text[fill="#595959"]', "fill")).L).toBeGreaterThan(0.5);
      await koyuMu(".bl-body .bl-textbox");
      await acikMetin(".bl-body .bl-textbox p");
    } else {
      expect((await renk(grafikZemin, "fill")).rgb).toBe("255,255,255");
      expect((await renk(".bl-body .bl-textbox", "backgroundColor")).rgb).toBe("218,233,247");
    }
    await page.getByRole("button", { name: "Geri", exact: true }).click();

    // Gölgelendirme, yazı zemini, vurgu, hücre dolguları ve tablo stilleri.
    await ac(page, ornek("dolgular.docx"));
    const golgeli = '.bl-body p[style*="background"]';
    const acikBaslik = '.bl-body table[data-table-style="light-blue"] tr:first-child > td';
    const bant = '.bl-body table[data-table-style="light-blue"] tr:nth-child(3) > td';
    const koyuBaslik = '.bl-body table[data-table-style="grid-blue"] tr:first-child > td';
    const vurgu = ".bl-body mark";
    const koyuHucre = '.bl-body td[data-bg="#1F3864"]';
    const pastelHucre = '.bl-body td[data-bg="#DEEAF6"]';
    await expect(page.locator(acikBaslik).first()).toBeVisible();
    // Belirgin dolgular her iki temada kâğıttaki gibi.
    expect((await renk(koyuBaslik, "backgroundColor")).rgb).toBe("21,96,130");
    expect((await renk(vurgu, "backgroundColor")).rgb).toBe("255,255,0");
    expect((await renk(koyuHucre, "backgroundColor")).rgb).toBe("31,56,100");
    if (koyu) {
      for (const sel of [golgeli, acikBaslik, bant, pastelHucre, '.bl-body span[style*="background"]']) await koyuMu(sel);
      for (const sel of [golgeli, `${acikBaslik} p`, `${bant} p`, `${pastelHucre} p`]) await acikMetin(sel);
      // Tablonun kendisi beyaz blok bırakmaz.
      expect((await renk('.bl-body table[data-table-style="light-blue"]', "backgroundColor")).L).toBeLessThan(0.25);
      // Belirgin dolgunun metni özgün rengini korur.
      expect((await renk(`${koyuBaslik} p`, "webkitTextFillColor")).rgb).toBe("255,255,255");
      expect((await renk(vurgu, "webkitTextFillColor")).rgb).toBe("0,0,0");
    } else {
      expect((await renk(golgeli, "backgroundColor")).rgb).toBe("226,239,217");
      expect((await renk(acikBaslik, "backgroundColor")).rgb).toBe("218,233,247");
      expect((await renk(pastelHucre, "backgroundColor")).rgb).toBe("222,234,246");
      expect((await renk(`${bant} p`, "webkitTextFillColor")).L).toBeLessThan(0.2);
    }
  });
});
