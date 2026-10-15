// Otomatik kurtarma: kaydedilmemiş değişiklikler uygulama arka plana gidince taslak olarak saklanır;
// uygulama kapanıp (sayfa yeniden yüklenir) açılınca başlangıç ekranında önerilir, açılınca
// kaydedilmemiş olarak gelir; kaydedilince ya da vazgeçilince taslak silinir.
//
// Süreç sonlanmasına dayanıklılık (Android, sahte yerel köprü): arka plana al → süreci öldür (sayfa
// yeniden yüklenir, etkinlik kayıtlı durumla kurulur) → geri dön: belge, konum ve imleç kendiliğinden gelir.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ARKA_PLAN_BUTCESI as BUTCE_MS } from "../src/platform/taslak";
import { download, fixture, newDoc, start } from "./ortak";

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

/* ------------------------------------------------------------------ */
/* Süreç sonlanması: arka plana al / öldür / geri dön (sahte köprü)      */
/* ------------------------------------------------------------------ */

const ORNEK = readFileSync(fixture("belge", "cok-bolumlu.docx"));
const URI = "content://belgeler/document/31";

interface Oh {
  calls: { plugin: string; method: string; options: Record<string, unknown> }[];
  /** Olay → canlı dinleyiciler (kimlik → geri çağırma); Capacitor gibi kaldırılan dinleyici silinir. */
  listeners: Record<string, Record<string, (d: unknown) => void>>;
}

/**
 * Sayfa betiklerinden önce: sahte Capacitor yerel köprüsü (uygulama gerçek native.ts koduyla "android"
 * olarak çalışır). Etkinlik her yüklemede kayıtlı durumla kurulmuş sayılır (süreç sonlanmasından dönüş);
 * localStorage "oh-e2e-taze" varsa taze açılış (kullanıcı uygulamayı kaydırıp kapatmış).
 */
async function androidMode(page: Page) {
  await page.route("**/_capacitor_file_/**", (route) => route.fulfill({ status: 200, body: ORNEK, contentType: "application/octet-stream" }));
  await page.addInitScript((uri) => {
    const w = window as unknown as Record<string, unknown>;
    const calls: Oh["calls"] = [];
    const listeners: Oh["listeners"] = {};
    w.__oh = { calls, listeners };
    w.androidBridge = { postMessage() {} };
    const promise = (...names: string[]) => names.map((name) => ({ name, rtype: "promise" }));
    const events = [
      { name: "addListener", rtype: "callback" },
      { name: "removeListener", rtype: "callback" },
    ];
    const dosya = (n: number) => ({ uri, name: "cok-bolumlu.docx", path: `/data/user/0/com.officehere.mobile/cache/oh-in/${n}.bin`, writable: true, persisted: true });
    let n = 0;
    let kimlik = 0;
    w.Capacitor = {
      PluginHeaders: [
        { name: "OfficeHereFiles", methods: [...promise("pickDocument", "readDocument", "writeDocument", "createDocument", "discard", "releaseUnused"), ...events] },
        { name: "OfficeHereWindow", methods: promise("setBackground", "ready", "launchState") },
        { name: "OfficeHereSystem", methods: promise("print", "writeClipboard", "readClipboard") },
        { name: "Filesystem", methods: promise("writeFile", "appendFile", "deleteFile") },
        { name: "Share", methods: promise("share") },
        { name: "StatusBar", methods: promise("setStyle", "setBackgroundColor") },
        { name: "SystemBars", methods: promise("setStyle") },
        { name: "Keyboard", methods: events },
        { name: "App", methods: [...promise("exitApp"), ...events] },
      ],
      convertFileSrc: (p: string) => "/_capacitor_file_" + p,
      nativeCallback(plugin: string, method: string, options: { eventName: string; callbackId?: string }, cb: (d: unknown) => void) {
        const key = `${plugin}.${options.eventName}`;
        if (method === "addListener") {
          const id = `${key}#${++kimlik}`;
          (listeners[key] ??= {})[id] = cb;
          return id;
        }
        if (method === "removeListener" && options.callbackId) delete listeners[key]?.[options.callbackId];
        return key;
      },
      async nativePromise(plugin: string, method: string, options: Record<string, unknown> = {}) {
        calls.push({ plugin, method, options });
        if (plugin === "OfficeHereWindow" && method === "launchState") return { restored: localStorage.getItem("oh-e2e-taze") !== "1" };
        if (plugin === "OfficeHereFiles" && (method === "pickDocument" || method === "readDocument")) return dosya(++n);
        if (plugin === "Filesystem" && method === "writeFile") return { uri: `file:///data/user/0/com.officehere.mobile/cache/${options.path}` };
        return {};
      },
    };
  }, URI);
}

const cagrilar = (page: Page, plugin: string, method: string) =>
  page.evaluate(([p, m]) => (window as unknown as { __oh: Oh }).__oh.calls.filter((c) => c.plugin === p && c.method === m), [plugin, method]);

/** Uygulama yerel platformla açıldı (ilk çizimden sonra OfficeHereWindow.ready). */
async function hazir(page: Page) {
  await expect.poll(async () => (await cagrilar(page, "OfficeHereWindow", "ready")).length, { timeout: 30_000 }).toBeGreaterThan(0);
}

/**
 * Android uygulamayı arka plana alır (onPause + onStop: "pause" ve appStateChange); oturum kaydı (taslak
 * bekleniyorsa o da) IndexedDB'ye yazılana dek bekler. Oturum kaydı (belge, konum, görünüm) bütçe içinde
 * olmalı; taslağın süresi belgeye ve makineye bağlı, test notu olarak raporlanır.
 */
async function arkaPlanaAl(page: Page, taslakBekle: boolean): Promise<void> {
  const r = await arkaPlanaGec(page, taslakBekle);
  test.info().annotations.push({ type: "arka plan", description: `oturum ${Math.round(r.oturum)} ms${r.taslak === undefined ? "" : `, taslak ${Math.round(r.taslak)} ms`}` });
  expect(r.oturum).toBeLessThan(BUTCE_MS);
}

function arkaPlanaGec(page: Page, taslakBekle: boolean): Promise<{ oturum: number; taslak?: number }> {
  return page.evaluate(async (taslakBekle) => {
    const oh = (window as unknown as { __oh: Oh }).__oh;
    const t0 = Date.now();
    const p0 = performance.now();
    const yay = (olay: string, veri: unknown) => Object.values(oh.listeners[olay] ?? {}).forEach((f) => f(veri));
    yay("App.pause", {});
    yay("App.appStateChange", { isActive: false });
    // Veritabanı yoksa oluşturulmaz (sürüm yükseltmesi iptal): uygulamanın kendi şeması kurulmalı.
    const oku = <T,>(db: string, store: string, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> =>
      new Promise((r) => {
        const q = indexedDB.open(db);
        q.onupgradeneeded = () => q.transaction?.abort();
        q.onsuccess = () => {
          const d = q.result;
          if (!d.objectStoreNames.contains(store)) {
            d.close();
            r(null);
            return;
          }
          const t = d.transaction(store, "readonly");
          const req = fn(t.objectStore(store));
          t.oncomplete = () => {
            d.close();
            r((req.result as T) ?? null);
          };
          t.onerror = () => r(null);
        };
        q.onerror = () => r(null);
      });
    let oturum: number | undefined;
    for (;;) {
      const o = await oku<{ ekran: string; zaman: number }>("officehere-mobil-oturum", "oturum", (s) => s.get("son"));
      if (o && o.zaman >= t0) oturum ??= performance.now() - p0;
      const t = o && taslakBekle ? await oku<{ savedAt: number }>("officehere-mobil", "taslaklar", (s) => s.get(o.ekran)) : null;
      if (oturum !== undefined && !taslakBekle) return { oturum };
      if (oturum !== undefined && t && t.savedAt >= t0) return { oturum, taslak: performance.now() - p0 };
      if (performance.now() - p0 > 15_000) {
        const dinleyiciler = Object.fromEntries(Object.entries(oh.listeners).map(([k, v]) => [k, Object.keys(v).length]));
        throw new Error(`Oturum kaydı yazılmadı: ${JSON.stringify({ o, t, t0, dinleyiciler })}`);
      }
      await new Promise((r) => setTimeout(r, 10));
    }
  }, taslakBekle);
}

/** Belge düzenleyicisinin seçimi ve kaydırma kutusunun konumu (tiptap: .ProseMirror öğesinin editor alanı). */
const belgeDurumu = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector(".m-belge-main .ProseMirror") as (HTMLElement & { editor?: { state: { selection: { anchor: number; head: number } } } }) | null;
    const sc = el?.closest(".bl-scroll") as HTMLElement | null;
    const s = el?.editor?.state.selection;
    return { anchor: s?.anchor ?? -1, head: s?.head ?? -1, top: sc?.scrollTop ?? -1, yukseklik: sc?.scrollHeight ?? 0 };
  });

const govde = (page: Page) => page.locator(".m-belge-main .ProseMirror");

test.describe("süreç sonlanması: arka plana al, öldür, geri dön", () => {
  test("Belge: kaydedilmemiş metin, imleç ve kaydırma kendiliğinden geri gelir; yazmaya imleçten devam edilir", async ({ page }) => {
    await androidMode(page);
    await page.goto("./");
    await hazir(page);
    await page.getByRole("button", { name: "Aç", exact: true }).click();
    await expect(page.getByRole("heading", { name: "cok-bolumlu.docx" })).toBeVisible();
    await page.getByRole("button", { name: "Düzenle" }).click();
    // Belgenin ortasındaki (ilk ekranın çok altındaki) bir paragrafa gidilir, yazılır.
    const adaylar = govde(page).locator("p:not(table p)", { hasText: /\S/ });
    const hedef = adaylar.nth(Math.floor((await adaylar.count()) * 0.6));
    await hedef.scrollIntoViewIfNeeded();
    await hedef.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Ekledim");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(altSatir(page)).toContainText("Kaydedilmedi");
    const once = await belgeDurumu(page);
    expect(once.top).toBeGreaterThan(0);

    await arkaPlanaAl(page, true);
    await page.reload();

    // Başlangıç ekranı değil, belge: içerik, imleç ve kaydırma.
    await expect(page.getByRole("heading", { name: "cok-bolumlu.docx" })).toBeVisible();
    await expect(govde(page)).toContainText("Ekledim");
    await expect(altSatir(page)).toContainText("Kaydedilmedi");
    await expect(page.getByRole("button", { name: "Aç", exact: true })).toHaveCount(0);
    await expect.poll(async () => {
      const s = await belgeDurumu(page);
      return [s.anchor, s.head];
    }).toEqual([once.anchor, once.head]);
    await expect.poll(async () => Math.abs((await belgeDurumu(page)).top - once.top)).toBeLessThan(40);

    // Düzenlemeye geçince imleç kaldığı yerde: yazılan, "Ekledim" sözcüğünün içine girer.
    await page.getByRole("button", { name: "Düzenle" }).click();
    await page.keyboard.type("Z");
    await expect(govde(page)).toContainText("EkledZim");
    // Kaydedilen yer özgün dosya (yeniden okunarak oturuma bağlandı).
    expect((await cagrilar(page, "OfficeHereFiles", "readDocument")).at(-1)?.options).toEqual({ uri: URI });
  });

  test("Belge: kaydedilmiş belge konumundan yeniden okunur ve kaldığı yere kaydırılır", async ({ page }) => {
    await androidMode(page);
    await page.goto("./");
    await hazir(page);
    await page.getByRole("button", { name: "Aç", exact: true }).click();
    await expect(page.getByRole("heading", { name: "cok-bolumlu.docx" })).toBeVisible();
    await govde(page).locator("p", { hasText: /\S/ }).nth(150).scrollIntoViewIfNeeded();
    const once = await belgeDurumu(page);
    expect(once.top).toBeGreaterThan(0);
    await arkaPlanaAl(page, false);
    await page.reload();

    await expect(page.getByRole("heading", { name: "cok-bolumlu.docx" })).toBeVisible();
    await expect.poll(async () => Math.abs((await belgeDurumu(page)).top - once.top)).toBeLessThan(40);
    await expect(altSatir(page)).not.toContainText("Kaydedilmedi");
    await expect(page.locator(".m-belge-not")).toHaveCount(0);
    expect(await cagrilar(page, "OfficeHereFiles", "readDocument")).toEqual([expect.objectContaining({ options: { uri: URI } })]);
  });

  test("Tablo: değerler, etkin sayfa ve hücre geri gelir", async ({ page }) => {
    await androidMode(page);
    await page.goto("./");
    await hazir(page);
    await newDoc(page, "tablo");
    await expect(page.locator(".m-tablo-grid")).toBeVisible({ timeout: 30_000 });
    const fb = page.getByLabel("Formül çubuğu", { exact: true });
    await fb.click();
    for (const v of ["7", "8", "=A1*A2"]) {
      await page.keyboard.type(v);
      await page.keyboard.press("Enter");
    }
    await page.getByLabel("Ad Kutusu", { exact: true }).fill("C5");
    await page.getByLabel("Ad Kutusu", { exact: true }).press("Enter");
    await expect(page.getByRole("status", { name: "Hücre bilgisi" })).toHaveText(/^C5/);
    await expect(altSatir(page)).toContainText("Kaydedilmedi");
    await arkaPlanaAl(page, true);
    await page.reload();

    await expect(page.locator(".m-tablo-grid")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".m-appbar h1")).toHaveText("Kitap1.xlsx");
    await expect(altSatir(page)).toContainText("Kaydedilmedi");
    await expect(page.getByRole("status", { name: "Hücre bilgisi" })).toHaveText(/^C5/);
    await page.getByLabel("Ad Kutusu", { exact: true }).fill("A3");
    await page.getByLabel("Ad Kutusu", { exact: true }).press("Enter");
    await expect(page.getByRole("status", { name: "Hücre bilgisi" })).toHaveText("A3: 56");
  });

  test("Sunum: kaydedilmemiş slaytlar ve etkin slayt geri gelir", async ({ page }) => {
    await androidMode(page);
    await page.goto("./");
    await hazir(page);
    await newDoc(page, "sunum");
    await page.getByText("Başlık eklemek için tıklayın", { exact: true }).click();
    await page.keyboard.type("Süreç sınaması");
    await page.getByRole("button", { name: "Yeni slayt", exact: true }).first().click();
    await page.getByRole("dialog", { name: "Yeni slayt" }).getByRole("button", { name: "Başlık ve İçerik" }).click();
    await expect(page.getByRole("button", { name: "Slayt 2", exact: true })).toHaveAttribute("aria-current", "true");
    await expect(altSatir(page)).toContainText("Kaydedilmedi");
    await arkaPlanaAl(page, true);
    await page.reload();

    await expect(page.getByRole("button", { name: "Slayt 2", exact: true })).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("list", { name: "Slaytlar" }).getByRole("button", { name: /^Slayt \d/ })).toHaveCount(2);
    await expect(altSatir(page)).toContainText("Kaydedilmedi");
    await page.getByRole("button", { name: "Slayt 1", exact: true }).click();
    await expect(page.locator(".m-sunum-kagit")).toContainText("Süreç sınaması");
  });

  test("öldürülmeden dönüşte belge açık kalır; kaydırıp kapatılan uygulama ve ikinci deneme başlangıç ekranıyla açılır", async ({ page }) => {
    await androidMode(page);
    await page.goto("./");
    await hazir(page);
    await newDoc(page, "belge");
    await govde(page).click();
    await page.keyboard.type("Kaydırıp kapatıldı.");
    await expect(govde(page)).toContainText("Kaydırıp kapatıldı.");
    await arkaPlanaAl(page, true);
    // Süreç yaşıyor: ön plana dönüşte hiçbir şey değişmez.
    await page.evaluate(() => Object.values((window as unknown as { __oh: Oh }).__oh.listeners["App.appStateChange"] ?? {}).forEach((f) => f({ isActive: true })));
    await expect(govde(page)).toContainText("Kaydırıp kapatıldı.");

    // Kullanıcı uygulamayı son kullanılanlardan kaydırıp kapattı: taze açılış, taslak başlangıç ekranında önerilir.
    await page.evaluate(() => localStorage.setItem("oh-e2e-taze", "1"));
    await page.reload();
    await expect(kurtarilan(page).getByRole("button", { name: /^Belge1\.docx Kaydedilmemiş/ })).toBeVisible();
    await page.evaluate(() => localStorage.removeItem("oh-e2e-taze"));

    // Taslak açılır, uygulama yeniden arka plana alınıp öldürülür: kendiliğinden geri gelir…
    await kurtarilan(page).getByRole("button", { name: /^Belge1\.docx Kaydedilmemiş/ }).click();
    await expect(govde(page)).toContainText("Kaydırıp kapatıldı.");
    await arkaPlanaAl(page, false);
    await page.reload();
    await expect(govde(page)).toContainText("Kaydırıp kapatıldı.");
    // …ama açılışta yeniden sonlanırsa (ör. belge açılırken çöktü) aynı kayıt ikinci kez denenmez.
    await page.reload();
    await expect(page.getByRole("button", { name: "Aç", exact: true })).toBeVisible();
    await expect(kurtarilan(page).getByRole("listitem")).toHaveCount(1);
  });
});
