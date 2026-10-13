// Sunum e2e örnek dosyalarını masaüstü modeli ve yazıcısıyla üretir.
// Kullanım (depo kökünde): node e2e/fixtures/sunum/uret.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../../..");

/** Basit RGB PNG kodlayıcı (beyaz zemin, sağ altta mavi işaret). */
function png(w, h, pixel) {
  const crcTab = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTab[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const server = await createServer({ root, configFile: path.join(root, "vite.config.ts"), server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { newPresentation, newSlide } = await server.ssrLoadModule("@sunum/model/presentation");
  const { writePptx } = await server.ssrLoadModule("@sunum/io/pptxWriter");
  const { textBody } = await server.ssrLoadModule("@sunum/model/factory");

  const doku = png(128, 72, (x, y) => (x > 110 && y > 56 ? [31, 95, 191] : (x + y) % 9 === 0 ? [244, 244, 244] : [255, 255, 255]));
  const pres = newPresentation();
  pres.master = { ...pres.master, background: { type: "image", src: `data:image/png;base64,${doku.toString("base64")}`, mode: "stretch" } };
  const yaz = (sl, metin) => {
    const t = sl.shapes.find((s) => s.kind === "sp" && (s.ph?.type === "ctrTitle" || s.ph?.type === "title"));
    if (t) t.text = textBody(metin);
    return sl;
  };
  pres.slides = [yaz(newSlide(pres, "title"), "Resim zeminli sunu")];
  const g = yaz(newSlide(pres, "titleOnly"), "Satışlar");
  g.shapes.push({
    kind: "chart",
    id: "grafik1",
    name: "Grafik 1",
    x: 160,
    y: 180,
    w: 960,
    h: 480,
    rot: 0,
    chart: { type: "col", showTitle: true, title: "Çeyrekler", categories: ["Ç1", "Ç2", "Ç3", "Ç4"], series: [{ name: "2026", values: [12, 18, 15, 22] }, { name: "2027", values: [14, 21, 19, 27] }], legend: "b" },
  });
  pres.slides.push(g);
  writeFileSync(path.join(here, "resim-zemin.pptx"), await writePptx(pres));
  console.log("resim-zemin.pptx yazıldı");
} finally {
  await server.close();
}
