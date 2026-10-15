// Worker dumanı: masaüstünün Belge ve Tablo dosya G/Ç Worker'ları mobil derleme yapılandırmasıyla
// (vite.config.ts: takma adlar, worker.format "es", base "./") üretim paketi olarak derlenir ve Capacitor'un
// yaptığı gibi duruk dosyalardan sunulur (e2e/isci/). Gerçek modül Worker'ı kurulmalı, süreç içi yedeğe
// düşülmemeli; okuma → yazma → yeniden okuma doğru olmalı. Worker yoksa (kısıtlı ortam) aynı istemciler
// süreç içinde çalışır.
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./ortak";

const KOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TUR: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };

// Tek derleme: dosyadaki testler aynı işçide sırayla koşar.
test.describe.configure({ mode: "serial" });

let dizin = "";
let sunucu: http.Server | null = null;
let adres = "";

test.beforeAll(async () => {
  test.setTimeout(240_000);
  dizin = fs.mkdtempSync(path.join(os.tmpdir(), "oh-isci-"));
  await build({
    configFile: path.join(KOK, "vite.config.ts"),
    root: KOK,
    logLevel: "warn",
    build: { outDir: dizin, emptyOutDir: true, rolldownOptions: { input: path.join(KOK, "e2e/isci/index.html") } },
  });
  sunucu = http.createServer((req, res) => {
    const yol = path.join(dizin, decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    if (!yol.startsWith(dizin) || !fs.existsSync(yol) || !fs.statSync(yol).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": TUR[path.extname(yol)] ?? "application/octet-stream" });
    fs.createReadStream(yol).pipe(res);
  });
  await new Promise<void>((r) => sunucu!.listen(0, "127.0.0.1", r));
  adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}/e2e/isci/index.html`;
});

test.afterAll(async () => {
  await new Promise<void>((r) => (sunucu ? sunucu.close(() => r()) : r()));
  if (dizin) fs.rmSync(dizin, { recursive: true, force: true });
});

/** Sayfa betiğine dosya baytlarını verip işlevi çalıştırır. */
function calistir<T>(page: Page, islev: "belge" | "tablo", ad: string, dosya: string): Promise<T> {
  const b64 = fs.readFileSync(dosya).toString("base64");
  return page.evaluate(
    async ([islev, ad, b64]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
      const isci = (window as unknown as { __isci: Record<string, (ad: string, b: ArrayBuffer) => Promise<unknown>> }).__isci;
      return isci[islev](ad, bytes) as Promise<T>;
    },
    [islev, ad, b64] as const,
  );
}

interface BelgeSonuc {
  bicim: string;
  metin: string;
  imza: string;
  geriMetin: string;
}

interface TabloSonuc {
  bicim: string;
  sayfalar: string[];
  deger: unknown;
  imza: string;
  geriSayfalar: string[];
  geriDeger: unknown;
}

test("Belge ve Tablo G/Ç'si üretim paketinde modül Worker'ında çalışır", async ({ page }) => {
  const workerlar: string[] = [];
  const uyarilar: string[] = [];
  page.on("worker", (w) => workerlar.push(w.url()));
  page.on("console", (m) => m.type() === "warning" && uyarilar.push(m.text()));
  page.on("pageerror", (e) => uyarilar.push(e.message));
  await page.goto(adres);
  await expect(page.locator("html[data-hazir='1']")).toHaveCount(1);

  const b = await calistir<BelgeSonuc>(page, "belge", "cok-bolumlu.docx", fixture("belge", "cok-bolumlu.docx"));
  expect(b.bicim).toBe("docx");
  expect(b.metin.length).toBeGreaterThan(100);
  expect(b.imza).toBe("PK");
  expect(b.geriMetin).toBe(b.metin);

  const t = await calistir<TabloSonuc>(page, "tablo", "ornek.ods", fixture("tablo", "ornek.ods"));
  expect(t.bicim).toBe("ods");
  expect(t.sayfalar).toEqual(["Satışlar", "Özet", "Uzun", "Gizli"]);
  expect(t.deger).toBe("Ürün");
  expect(t.imza).toBe("PK");
  expect(t.geriSayfalar).toEqual(t.sayfalar);
  expect(t.geriDeger).toBe("Ürün");

  // Belge ve Tablo'nun kendi Worker paketleri (göreli yoldan, modül olarak) kuruldu; yedeğe düşülmedi.
  expect(workerlar.some((u) => /\/assets\/io\.worker-[^/]+\.js$/.test(u))).toBe(true);
  expect(new Set(workerlar.filter((u) => /io\.worker/.test(u))).size).toBeGreaterThanOrEqual(2);
  expect(uyarilar.filter((u) => /Worker/.test(u))).toEqual([]);
});

test("Worker yoksa aynı istemciler süreç içinde çalışır", async ({ page }) => {
  const workerlar: string[] = [];
  page.on("worker", (w) => workerlar.push(w.url()));
  await page.addInitScript(() => {
    // Worker desteklemeyen ortam (ör. kısıtlı WebView): istemci süreç içi yola düşmeli.
    Object.defineProperty(window, "Worker", { value: undefined, configurable: true });
  });
  await page.goto(adres);
  await expect(page.locator("html[data-hazir='1']")).toHaveCount(1);
  const b = await calistir<BelgeSonuc>(page, "belge", "cok-bolumlu.docx", fixture("belge", "cok-bolumlu.docx"));
  expect(b.imza).toBe("PK");
  expect(b.geriMetin).toBe(b.metin);
  const t = await calistir<TabloSonuc>(page, "tablo", "ornek.ods", fixture("tablo", "ornek.ods"));
  expect(t.geriDeger).toBe("Ürün");
  expect(workerlar).toEqual([]);
});
