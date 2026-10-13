// Android platform katmanı tarayıcıda: Capacitor yerel köprüsü (window.androidBridge + eklenti
// başlıkları) taklit edilir; uygulama gerçek native.ts koduyla "android" olarak çalışır.
// Denetlenen: "Birlikte aç" (soğuk açılış), aynı konuma kaydetme, yeni belgede konum seçtirme,
// paylaşma, durum çubuğu/pencere rengi.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./ortak";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ORNEK = readFileSync(fixture("belge", "cok-bolumlu.docx"));

interface Call {
  plugin: string;
  method: string;
  options: Record<string, unknown>;
}

/** Sayfa betiklerinden önce: sahte yerel köprü. coldStart verilirse dinleyici bağlanınca gönderilir. */
async function androidMode(page: Page, coldStart?: Record<string, unknown>) {
  await page.route("**/_capacitor_file_/**", (route) => route.fulfill({ status: 200, body: ORNEK, contentType: "application/octet-stream" }));
  await page.addInitScript((cold) => {
    type Fn = (o: Record<string, unknown>) => unknown;
    const w = window as unknown as Record<string, unknown>;
    const calls: Call[] = [];
    const listeners: Record<string, (d: unknown) => void> = {};
    const files: Record<string, string[]> = {};
    const handlers: Record<string, Fn> = {};
    w.__oh = { calls, listeners, files, handlers };
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
        { name: "Filesystem", methods: promise("writeFile", "appendFile", "deleteFile") },
        { name: "Share", methods: promise("share") },
        { name: "StatusBar", methods: promise("setStyle", "setBackgroundColor") },
        { name: "SystemBars", methods: promise("setStyle") },
        { name: "Keyboard", methods: events },
        { name: "App", methods: [...promise("exitApp"), ...events] },
      ],
      convertFileSrc: (p: string) => "/_capacitor_file_" + p,
      nativeCallback(plugin: string, method: string, options: { eventName: string }, cb: (d: unknown) => void) {
        const key = `${plugin}.${options.eventName}`;
        if (method === "addListener") {
          listeners[key] = cb;
          if (cold && key === "OfficeHereFiles.externalOpen") setTimeout(() => cb(cold), 0);
        }
        return key;
      },
      async nativePromise(plugin: string, method: string, options: Record<string, unknown> = {}) {
        calls.push({ plugin, method, options });
        const h = handlers[`${plugin}.${method}`];
        if (h) return h(options);
        if (plugin === "Filesystem" && method === "writeFile") {
          files[options.path as string] = [options.data as string];
          return { uri: `file:///data/user/0/com.officehere.mobile/cache/${options.path}` };
        }
        if (plugin === "Filesystem" && method === "appendFile") files[options.path as string].push(options.data as string);
        if (plugin === "OfficeHereFiles" && method === "writeDocument") return { uri: options.uri, name: "?", writable: true };
        return {};
      },
    };
  }, coldStart);
}

const calls = (page: Page, plugin: string, method: string) =>
  page.evaluate(([p, m]) => ((window as unknown as { __oh: { calls: Call[] } }).__oh.calls).filter((c) => c.plugin === p && c.method === m), [plugin, method]);

/** Filesystem'e parça parça yazılan base64 içeriğin ilk baytları. */
const writtenHead = (page: Page, path: string) =>
  page.evaluate((p) => {
    const parts = (window as unknown as { __oh: { files: Record<string, string[]> } }).__oh.files[p] ?? [];
    return parts.map((b) => atob(b)).join("").slice(0, 2);
  }, path);

const relOf = (uri: string) => uri.replace("file:///data/user/0/com.officehere.mobile/cache/", "");

/** Uygulama yerel platformla açıldı (ilk çizimden sonra OfficeHereWindow.ready çağrılır).
 *  Vite ilk yüklemede bağımlılık iyileştirip sayfayı yenileyebilir; o yüzden sabırla beklenir. */
async function ready(page: Page) {
  await page.goto("./");
  await expect.poll(async () => (await calls(page, "OfficeHereWindow", "ready")).length, { timeout: 30_000 }).toBe(1);
}

test.describe("Android platformu", () => {
  test("Birlikte aç ile gelen belge açılır, aynı konuma kaydedilir ve paylaşılır", async ({ page }) => {
    const uri = "content://com.android.providers.downloads.documents/document/42";
    await androidMode(page, { uri, name: "rapor", mime: DOCX, size: ORNEK.length, path: "/data/user/0/com.officehere.mobile/cache/oh-in/1.bin", writable: true });
    await ready(page);
    // Soğuk açılışta gelen dosya, uygulama dinlemeye başlayınca açılır; uzantı MIME türünden tamamlanır.
    await expect(page.getByRole("heading", { name: "rapor.docx" })).toBeVisible();
    expect(await calls(page, "OfficeHereFiles", "discard")).toEqual([expect.objectContaining({ options: { path: "/data/user/0/com.officehere.mobile/cache/oh-in/1.bin" } })]);

    // Görüntüleme kipinde açılır; kaydetme düzenleme kipinde.
    await page.getByRole("button", { name: "Düzenle" }).click();
    await page.getByRole("button", { name: "Kaydet" }).first().click();
    await expect(page.getByText('"rapor.docx" kaydedildi.')).toBeVisible();
    const writes = await calls(page, "OfficeHereFiles", "writeDocument");
    expect(writes).toHaveLength(1);
    expect(writes[0].options.uri).toBe(uri);
    expect(await writtenHead(page, relOf(writes[0].options.path as string))).toBe("PK");
    expect(await calls(page, "OfficeHereFiles", "createDocument")).toHaveLength(0);

    await page.getByRole("button", { name: "Daha fazla" }).first().click();
    await page.getByRole("button", { name: "Paylaş" }).click();
    await expect.poll(async () => (await calls(page, "Share", "share")).length).toBe(1);
    const share = (await calls(page, "Share", "share"))[0].options as { files: string[]; title: string };
    expect(share.title).toBe("rapor.docx");
    expect(share.files[0]).toMatch(/\/cache\/oh-share\/[^/]+\/rapor\.docx$/);
    expect(await writtenHead(page, relOf(share.files[0]))).toBe("PK");
  });

  test("yeni belge ilk kayıtta konum sorar (vazgeçilirse yeniden sorar), sonra aynı konuma yazar", async ({ page }) => {
    await androidMode(page);
    await ready(page);
    await page.evaluate(() => {
      const oh = (window as unknown as { __oh: { handlers: Record<string, (o: Record<string, unknown>) => unknown> } }).__oh;
      let n = 0;
      oh.handlers["OfficeHereFiles.createDocument"] = (o) => (++n === 1 ? { cancelled: true } : { uri: "content://belgeler/document/77", name: o.name, writable: true });
    });
    await page.getByRole("button", { name: "Yeni belge", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Belge1.docx" })).toBeVisible();

    const kaydet = page.getByRole("button", { name: "Kaydet" }).first();
    await kaydet.click();
    // Vazgeçmek hata sayılmaz: bildirim çıkmaz, belge kaydedilmemiş kalır.
    await expect.poll(async () => (await calls(page, "OfficeHereFiles", "createDocument")).length).toBe(1);
    await expect(page.getByText(/iptal edildi|Kaydedilemedi/)).toHaveCount(0);
    await kaydet.click();
    await expect(page.getByText('"Belge1.docx" kaydedildi.')).toBeVisible();
    const creates = await calls(page, "OfficeHereFiles", "createDocument");
    expect(creates).toHaveLength(2);
    expect(creates[1].options).toMatchObject({ name: "Belge1.docx", mime: DOCX });

    await kaydet.click();
    await expect.poll(async () => (await calls(page, "OfficeHereFiles", "writeDocument")).length).toBe(1);
    expect((await calls(page, "OfficeHereFiles", "writeDocument"))[0].options.uri).toBe("content://belgeler/document/77");
    expect(await calls(page, "OfficeHereFiles", "createDocument")).toHaveLength(2);
  });

  test("Aç: belge seçici desteklenen MIME türleriyle açılır, seçilen belge son kullanılanlara girer", async ({ page }) => {
    await androidMode(page);
    await ready(page);
    await page.evaluate(() => {
      const oh = (window as unknown as { __oh: { handlers: Record<string, () => unknown> } }).__oh;
      oh.handlers["OfficeHereFiles.pickDocument"] = () => ({ uri: "content://belgeler/document/5", name: "Teklif.docx", path: "/data/user/0/com.officehere.mobile/cache/oh-in/5.bin", writable: true, persisted: true });
    });
    await page.getByRole("button", { name: "Aç", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Teklif.docx" })).toBeVisible();
    const pick = (await calls(page, "OfficeHereFiles", "pickDocument"))[0].options as { mimeTypes: string[] };
    expect(pick.mimeTypes).toEqual(expect.arrayContaining([DOCX, "application/vnd.ms-excel", "application/vnd.oasis.opendocument.presentation", "text/csv"]));
    const recent = await page.evaluate(() => JSON.parse(localStorage.getItem("officehere.mobile.recent") ?? "[]"));
    expect(recent[0]).toMatchObject({ name: "Teklif.docx", app: "belge", uri: "content://belgeler/document/5" });
    // Kalıcı izinler son kullanılanlarla sınırlı tutulur.
    await expect.poll(async () => (await calls(page, "OfficeHereFiles", "releaseUnused")).at(-1)?.options).toEqual({ keep: ["content://belgeler/document/5"] });
  });

  test("durum çubuğu ve pencere zemini tema ve uygulama rengine uyar @koyu", async ({ page }) => {
    await androidMode(page);
    await ready(page);
    const dark = await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches);
    const last = async (plugin: string, method: string) => (await calls(page, plugin, method)).at(-1)?.options;
    // Başlangıç: "Renkli" temada lacivert, koyu temada koyu gri üst çubuk → açık renk simgeler.
    await expect.poll(() => last("OfficeHereWindow", "setBackground")).toEqual({ color: dark ? "#2b2b2b" : "#3d3d8f" });
    expect(await last("StatusBar", "setStyle")).toEqual({ style: "DARK" });
    const nav = (await calls(page, "SystemBars", "setStyle")).filter((c) => c.options.bar === "NavigationBar").at(-1)?.options;
    expect(nav).toEqual({ style: dark ? "DARK" : "LIGHT", bar: "NavigationBar" });

    // "Açık (Beyaz)" tema: beyaz üst çubuk → koyu simgeler.
    await page.getByRole("button", { name: "Ayarlar" }).click();
    await page.getByRole("radio", { name: "Açık (Beyaz)" }).click();
    await expect.poll(() => last("OfficeHereWindow", "setBackground")).toEqual({ color: "#ffffff" });
    expect(await last("StatusBar", "setStyle")).toEqual({ style: "LIGHT" });
  });
});
