// Belge e2e örnek dosyalarını masaüstü yazıcısıyla (writeDocx) üretir.
// Kullanım (depo kökünde): node e2e/fixtures/belge/uret.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const DIZIN = dirname(fileURLToPath(import.meta.url));
const KOK = join(DIZIN, "../../..");

// Yazıcılar tarayıcı DOM'u bekleyebilir.
const { window } = new JSDOM("<!doctype html><html><body></body></html>");
for (const k of ["window", "document", "DOMParser", "XMLSerializer", "Node", "HTMLElement", "navigator"]) {
  if (!(k in globalThis)) Object.defineProperty(globalThis, k, { value: k === "window" ? window : window[k], configurable: true });
}

const server = await createServer({ root: KOK, configFile: join(KOK, "vite.config.ts"), server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { writeDocx } = await server.ssrLoadModule("@belge/io");
  const { defaultSettings } = await server.ssrLoadModule("@belge/model/document");
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAFUlEQVR4nGM4oaFBEmIY1TCqATsCALRr0gH04WUkAAAAAElFTkSuQmCC";
  const t = (text, marks) => ({ type: "text", text, ...(marks ? { marks } : {}) });
  const p = (...content) => ({ type: "paragraph", content });
  const h = (level, text) => ({ type: "heading", attrs: { level }, content: [t(text)] });
  const cell = (text) => ({ type: "tableCell", content: [p(t(text))] });
  const belge = (content, settings = defaultSettings()) => ({ content: { type: "doc", content: [{ type: "section", content }] }, settings });

  const nesneler = belge([
    h(1, "Nesneler"),
    p(t("Metin kutusu, denklem, grafik, resim ve tablo mobilde yalnız görüntülenir.")),
    p(t("Denklem: "), { type: "equation", attrs: { latex: "x=\\frac{1}{2}", display: false } }),
    p({ type: "chart", attrs: { data: { type: "column", title: "Satış", categories: ["Ocak", "Şubat"], series: [{ name: "2026", values: [3, 4.5], color: "#156082" }], width: 360, height: 220 } } }),
    p(t("Resim: "), { type: "image", attrs: { src: PNG, width: 64, height: 48 } }),
    { type: "table", content: [{ type: "tableRow", content: [cell("Hücre A1"), cell("Hücre B1")] }, { type: "tableRow", content: [cell("Hücre A2"), cell("Hücre B2")] }] },
    p(t("Son paragraf.")),
    { type: "textBox", attrs: { x: 0, y: 8, w: 260, h: 70, border: "#C00000", borderWidth: 1.5, fill: "#DAE9F7" }, content: [p(t("Kutu içi metin"))] },
  ]);
  writeFileSync(join(DIZIN, "nesneler.docx"), await writeDocx(nesneler));

  // Dolgular: pastel gölgelendirme/zemin (koyu temada koyulaşır), sarı vurgu ve koyu hücre (kâğıttaki gibi kalır),
  // açık bantlı ve koyu başlıklı tablo stilleri.
  const satir = (...hucreler) => ({ type: "tableRow", content: hucreler });
  const hucre = (text, background) => ({ type: "tableCell", attrs: background ? { background } : {}, content: [p(t(text))] });
  const tablo = (attrs, satirlar) => ({ type: "table", attrs, content: satirlar.map((r) => satir(...r.map((x) => (Array.isArray(x) ? hucre(...x) : hucre(x))))) });
  const dolgular = belge([
    h(1, "Dolgular"),
    { type: "paragraph", attrs: { shading: "#E2EFD9" }, content: [t("Gölgeli paragraf metni.")] },
    p(t("Açık zeminli "), t("pastel sözcük", [{ type: "textStyle", attrs: { backgroundColor: "#FFF2CC" } }]), t(" ve "), t("sarı vurgu", [{ type: "highlight", attrs: { color: "#FFFF00" } }]), t(".")),
    tablo({ tableStyle: "light-blue", headerRow: true, bandedRows: true }, [["Açık başlık A", "Açık başlık B"], ["Satır 1", "Değer 1"], ["Bantlı satır", "Değer 2"], ["Satır 3", "Değer 3"]]),
    p(t("Ara paragraf.")),
    tablo({ tableStyle: "grid-blue", headerRow: true, bandedRows: true }, [["Koyu başlık A", "Koyu başlık B"], ["Mavi 1", "Mavi 2"], ["Mavi bant", "Mavi 3"]]),
    p(t("Ara paragraf 2.")),
    tablo({ tableStyle: "grid", headerRow: false, bandedRows: false }, [[["Koyu hücre", "#1F3864"], ["Pastel hücre", "#DEEAF6"]]]),
    p(t("Son.")),
  ]);
  writeFileSync(join(DIZIN, "dolgular.docx"), await writeDocx(dolgular));

  const renkli = defaultSettings();
  renkli.pageColor = "#FFF2CC";
  writeFileSync(join(DIZIN, "sayfa-rengi.docx"), await writeDocx(belge([h(1, "Renkli sayfa"), p(t("Bu sayfanın kendi zemin rengi var."))], renkli)));
  console.log("nesneler.docx, dolgular.docx, sayfa-rengi.docx yazıldı");
} finally {
  await server.close();
}
