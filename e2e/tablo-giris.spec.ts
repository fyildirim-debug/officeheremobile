// Tablo veri girişi (Pixel 7, dokunmatik): sayı hücresinde sayısal klavye (inputmode="decimal", Türkçe
// ondalık virgül), hücreden hücreye geçerken ekran klavyesi açık kalır, Enter ↓ / Sekme →, "satır sonu"
// düğmesi ve donanım klavyesinde seçili hücreye doğrudan yazma.
// Ekran klavyesi Android'deki gibi taklit edilir (sahte yerel köprü): yazılabilir bir alan odaktayken açıktır,
// odak yazılabilir olmayan bir yere geçince kapanır; açılıp kapanmalar sayılır, Capacitor Keyboard olayları
// gönderilir ve görünür alan küçülür (adjustResize).
import { expect, test, type Page } from "@playwright/test";
import { newDoc, start } from "./ortak";

const status = (page: Page) => page.getByRole("status", { name: "Hücre bilgisi" });
const formulaBar = (page: Page) => page.getByLabel("Formül çubuğu", { exact: true });
const nameBox = (page: Page) => page.getByLabel("Ad Kutusu", { exact: true });
const grid = (page: Page) => page.locator(".m-tablo-grid");

interface Klavye {
  acik: boolean;
  acilma: number;
  kapanma: number;
  olaylar: string[];
}

/** Sahte Android köprüsü ve ekran klavyesi (sayfa betiklerinden önce kurulur). */
async function sahteAndroid(page: Page) {
  const vp = page.viewportSize()!;
  await page.exposeFunction("__klavyeBoyut", (acik: boolean) => page.setViewportSize({ width: vp.width, height: acik ? Math.round(vp.height * 0.55) : vp.height }));
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const listeners: Record<string, (d: unknown) => void> = {};
    const k: Klavye = { acik: false, acilma: 0, kapanma: 0, olaylar: [] };
    w.__klavye = k;
    w.androidBridge = { postMessage() {} };
    const promise = (...names: string[]) => names.map((name) => ({ name, rtype: "promise" }));
    const events = [
      { name: "addListener", rtype: "callback" },
      { name: "removeListener", rtype: "callback" },
    ];
    w.Capacitor = {
      PluginHeaders: [
        { name: "OfficeHereFiles", methods: [...promise("pickDocument", "readDocument", "writeDocument", "createDocument", "discard", "releaseUnused"), ...events] },
        { name: "OfficeHereWindow", methods: promise("setBackground", "ready") },
        { name: "OfficeHereSystem", methods: promise("print", "writeClipboard", "readClipboard") },
        { name: "Filesystem", methods: promise("writeFile", "appendFile", "deleteFile") },
        { name: "Share", methods: promise("share") },
        { name: "StatusBar", methods: promise("setStyle", "setBackgroundColor") },
        { name: "SystemBars", methods: promise("setStyle") },
        { name: "Keyboard", methods: events },
        { name: "App", methods: [...promise("exitApp"), ...events] },
      ],
      nativeCallback(plugin: string, method: string, options: { eventName: string }, cb: (d: unknown) => void) {
        const key = `${plugin}.${options.eventName}`;
        if (method === "addListener") listeners[key] = cb;
        return key;
      },
      async nativePromise() {
        return {};
      },
    };
    // Ekran klavyesi: odaktaki öğe yazılabilir mi (salt okunur alan klavye açmaz)?
    const yazilabilir = (el: Element | null) =>
      !!el?.matches?.('textarea:not([readonly]), input:not([readonly]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), [contenteditable="true"]');
    const denetle = () => {
      const acik = yazilabilir(document.activeElement);
      if (acik === k.acik) return;
      k.acik = acik;
      if (acik) k.acilma++;
      else k.kapanma++;
      const olay = acik ? "keyboardWillShow" : "keyboardWillHide";
      k.olaylar.push(olay);
      listeners[`Keyboard.${olay}`]?.({ keyboardHeight: 320 });
      void (w.__klavyeBoyut as (a: boolean) => Promise<void>)?.(acik);
    };
    // Odak bir alandan ötekine geçerken klavye kapanmaz: karar odak olayları bittikten sonra verilir.
    document.addEventListener("focusin", () => setTimeout(denetle, 0), true);
    document.addEventListener("focusout", () => setTimeout(denetle, 0), true);
  });
}

const klavye = (page: Page) => page.evaluate(() => (window as unknown as { __klavye: Klavye }).__klavye);

/** Geliştirme sunucusundaki denetleyiciden hücre değeri ve kaydırma biçimi. */
function hucre(page: Page, ref: [number, number]) {
  return page.evaluate(([r, c]) => {
    const ctl = (window as unknown as { __tabloMobil: { sheet: unknown; wb: { getValue: (s: unknown, r: number, c: number) => unknown; styleAt: (s: unknown, r: number, c: number) => { wrap?: boolean } } } }).__tabloMobil;
    return { deger: ctl.wb.getValue(ctl.sheet, r, c), kaydir: !!ctl.wb.styleAt(ctl.sheet, r, c).wrap };
  }, ref);
}

async function yeniTablo(page: Page) {
  await start(page);
  await newDoc(page, "tablo");
  await expect(grid(page)).toBeVisible({ timeout: 30_000 });
}

async function goTo(page: Page, ref: string) {
  await nameBox(page).fill(ref);
  await nameBox(page).press("Enter");
}

/** Varsayılan boyutlu hücreye (%100: sütun 64, satır 20 px) parmakla dokunur. */
async function tapCell(page: Page, col: number, row: number) {
  const box = (await grid(page).boundingBox())!;
  await page.touchscreen.tap(box.x + 32 + col * 64 + 30, box.y + 20 + row * 20 + 10);
}

test.describe("Tablo veri girişi", () => {
  test("10 hücreye art arda sayı: klavye kapanmaz, sayı hücresinde sayısal klavye, nokta ondalık virgül olur", async ({ page }) => {
    await sahteAndroid(page);
    await yeniTablo(page);
    await formulaBar(page).click();
    await expect.poll(async () => (await klavye(page)).acik).toBe(true);
    // Klavye açıkken formül çubuğu ve tuşlar klavyenin üstünde
    await expect(page.locator(".m-tablo.is-docked")).toBeVisible();
    await expect(formulaBar(page)).toHaveAttribute("inputmode", "text");

    await page.keyboard.type("Miktar");
    await page.keyboard.press("Enter");
    // Başlığın altı: üstteki metin, harf klavyesi; düğmeyle sayı klavyesine geçilir
    await expect(nameBox(page)).toHaveValue("A2");
    await expect(formulaBar(page)).toHaveAttribute("inputmode", "text");
    await page.getByRole("button", { name: "Sayı klavyesi" }).click();
    await expect(formulaBar(page)).toHaveAttribute("inputmode", "decimal");
    await expect(page.getByRole("button", { name: "Harf klavyesi" })).toHaveText("ABC");

    // Sayısal klavyede ondalık tuşu nokta yazsa da virgüle çevrilir ("12.5" tarih olmaz)
    const sayilar = ["12.5", "3", "7.25", "100", "0.5", "42", "8.75", "15", "2.5", "60"];
    for (const [i, s] of sayilar.entries()) {
      await expect(nameBox(page)).toHaveValue(`A${i + 2}`);
      await expect(formulaBar(page)).toBeFocused();
      await expect(formulaBar(page)).toHaveAttribute("inputmode", "decimal");
      await page.keyboard.type(s);
      await expect(formulaBar(page)).toHaveValue(s.replace(".", ","));
      await page.keyboard.press("Enter");
    }
    await expect(nameBox(page)).toHaveValue("A12");
    await expect(formulaBar(page)).toBeFocused();
    // Sütundaki sayıların altı da sayısal
    await expect(formulaBar(page)).toHaveAttribute("inputmode", "decimal");
    expect(await klavye(page)).toMatchObject({ acik: true, acilma: 1, kapanma: 0, olaylar: ["keyboardWillShow"] });
    await expect(page.locator(".m-tablo.is-docked")).toBeVisible();

    expect((await hucre(page, [1, 0])).deger).toBe(12.5);
    expect((await hucre(page, [5, 0])).deger).toBe(0.5);
    // Onay düğmesi klavyeyi kapatır
    await page.keyboard.type("1");
    await page.getByRole("button", { name: "Gir", exact: true }).click();
    await expect.poll(async () => (await klavye(page)).kapanma).toBe(1);
    await goTo(page, "A2:A11");
    await expect(status(page)).toHaveText("Toplam: 251,5 · Ortalama: 25,15 · Sayı: 10");
  });

  test("Enter ↓ / Sekme →: düzenlerken ve düzenleme yokken; sağa geç düğmesi; hücreye dokununca klavye açık kalır", async ({ page }) => {
    await sahteAndroid(page);
    await yeniTablo(page);
    await formulaBar(page).click();
    // Sekmelerle sağa, Enter'la satırın başladığı sütunun altına
    for (const satir of [["Ad", "Soyad", "Yaş"], ["Ali", "Kaya", "30"]]) {
      for (const [i, v] of satir.entries()) {
        await page.keyboard.type(v);
        await page.keyboard.press(i < satir.length - 1 ? "Tab" : "Enter");
      }
    }
    await expect(nameBox(page)).toHaveValue("A3");
    await expect(formulaBar(page)).toBeFocused();
    // Düzenleme yokken de: Shift+Enter ↑, Sekme →, Shift+Sekme ←
    await page.keyboard.press("Shift+Enter");
    await expect(nameBox(page)).toHaveValue("A2");
    await expect(formulaBar(page)).toHaveValue("Ali");
    await page.keyboard.press("Tab");
    await expect(nameBox(page)).toHaveValue("B2");
    await expect(formulaBar(page)).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(nameBox(page)).toHaveValue("A2");
    // Ekran klavyesinde Sekme yok: "Gir ve sağa geç" düğmesi; seçili içerik yazılanla değişir
    await page.keyboard.type("Veli");
    await page.getByRole("button", { name: "Gir ve sağa geç" }).click();
    await expect(nameBox(page)).toHaveValue("B2");
    await expect(formulaBar(page)).toHaveValue("Kaya");
    await expect(formulaBar(page)).toBeFocused();
    expect((await hucre(page, [1, 0])).deger).toBe("Veli");
    expect((await hucre(page, [0, 2])).deger).toBe("Yaş");
    expect((await hucre(page, [1, 2])).deger).toBe(30);

    // Izgarada başka hücreye dokunma: giriş onaylanır, klavye açık kalır
    await page.keyboard.type("Demir");
    await tapCell(page, 3, 0);
    await expect(nameBox(page)).toHaveValue("D1");
    await expect(formulaBar(page)).toBeFocused();
    expect((await hucre(page, [1, 1])).deger).toBe("Demir");
    expect(await klavye(page)).toMatchObject({ acilma: 1, kapanma: 0 });

    // Düzenleme yokken Esc odağı bırakır (klavye kapanır)
    await page.keyboard.press("Escape");
    await expect(formulaBar(page)).not.toBeFocused();
    await expect.poll(async () => (await klavye(page)).kapanma).toBe(1);
  });

  test("satır sonu düğmesi: hücrede iki satır, metin kaydırılır", async ({ page }) => {
    await yeniTablo(page);
    await formulaBar(page).click();
    await page.keyboard.type("Satır 1");
    await page.getByRole("button", { name: "Satır sonu" }).click();
    await expect(formulaBar(page)).toBeFocused();
    await page.keyboard.type("Satır 2");
    await expect(formulaBar(page)).toHaveValue("Satır 1\nSatır 2");
    await page.keyboard.press("Enter");
    await expect(nameBox(page)).toHaveValue("A2");
    expect(await hucre(page, [0, 0])).toEqual({ deger: "Satır 1\nSatır 2", kaydir: true });
    // Formülde satır sonu ve klavye düğmesi yok, sembol tuşları var
    await page.keyboard.type("=");
    await expect(page.getByRole("button", { name: "Satır sonu" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sayı klavyesi" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "( ekle" })).toBeVisible();
    await expect(formulaBar(page)).toHaveAttribute("inputmode", "text");
  });

  test("donanım klavyesi: seçili hücreye doğrudan yazılır, hızlı yazılan harf kaybolmaz; Enter/Sekme ilerler", async ({ page }) => {
    await yeniTablo(page);
    await tapCell(page, 1, 1);
    await expect(nameBox(page)).toHaveValue("B2");
    await expect(formulaBar(page)).not.toBeFocused();
    // Tuşlar beklemeden art arda gelir (Bluetooth klavyede hızlı yazma); eskiden ilk harften sonrası kayboluyordu
    await Promise.all(["1", "2", "3", "4", "5"].map((k) => page.keyboard.press(k)));
    await expect(formulaBar(page)).toHaveValue("12345");
    await expect(formulaBar(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.type("Elma");
    await page.keyboard.press("Enter");
    await expect(nameBox(page)).toHaveValue("B3");
    expect((await hucre(page, [1, 1])).deger).toBe(12345);
    expect((await hucre(page, [1, 2])).deger).toBe("Elma");
    // Esc ile odak bırakılınca oklarla gezinilir, yazınca yeniden düzenlenir
    await page.keyboard.press("Escape");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await expect(nameBox(page)).toHaveValue("C2");
    await page.keyboard.type("7,5");
    await page.keyboard.press("Enter");
    expect((await hucre(page, [1, 2])).deger).toBe(7.5);
    await expect(status(page)).toHaveText("C3");
  });
});
