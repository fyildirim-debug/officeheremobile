// Worker dumanı (e2e/worker.spec.ts): masaüstünün Belge ve Tablo dosya G/Ç Worker'ları mobil derleme
// yapılandırmasıyla (takma adlar, worker.format "es", göreli taban) üretim paketi olarak derlenir; bu sayfa
// ikisini de çalıştırır. Uygulama ekranları bu istemcileri henüz kullanmıyor; Capacitor WebView'de
// (Chromium) Worker yolunun hazır olduğunu gösterir.
import type { JSONContent } from "@tiptap/core";
import { readInWorker, writeDocxInWorker } from "@belge/io/client";
import { openBookIo, writeBookIo } from "@tablo/io/client";

const metin = (n: JSONContent | undefined): string =>
  !n ? "" : (n.text ?? "") + (n.content ?? []).map(metin).join(n.type === "doc" ? "\n" : "");

const imza = (b: Uint8Array) => String.fromCharCode(b[0], b[1]);
const kopya = (b: Uint8Array) => b.slice().buffer as ArrayBuffer;

/** Belge: Worker'da oku → .docx yaz → yazılanı yeniden oku. */
async function belge(ad: string, bytes: ArrayBuffer) {
  const r = await readInWorker(ad, bytes);
  if (r.main) throw new Error("Belge Worker'da okunamadı (ana iş parçacığı istendi).");
  const yaz = await writeDocxInWorker(r.doc, false, async (ids) => Object.fromEntries(ids.map((id) => [id, null])));
  const geri = await readInWorker("geri.docx", kopya(yaz.bytes));
  if (geri.main) throw new Error("Yazılan belge Worker'da okunamadı.");
  return { bicim: r.format, metin: metin(r.doc.content), imza: imza(yaz.bytes), geriMetin: metin(geri.doc.content) };
}

/** Tablo: Worker'da aç → .xlsx yaz → yazılanı yeniden aç. */
async function tablo(ad: string, bytes: ArrayBuffer) {
  const o = await openBookIo(ad, bytes);
  const sayfa = o.wb.sheets[0];
  const out = await writeBookIo(o.wb, sayfa, "xlsx");
  const b = typeof out === "string" ? new TextEncoder().encode(out) : out;
  const g = await openBookIo("geri.xlsx", kopya(b));
  return {
    bicim: o.format,
    sayfalar: o.wb.sheets.map((s) => s.name),
    deger: o.wb.getValue(sayfa, 0, 0),
    imza: imza(b),
    geriSayfalar: g.wb.sheets.map((s) => s.name),
    geriDeger: g.wb.getValue(g.wb.sheets[0], 0, 0),
  };
}

Object.assign(window, { __isci: { belge, tablo } });
document.documentElement.dataset.hazir = "1";
