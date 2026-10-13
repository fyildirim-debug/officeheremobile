// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPresentationFile } from "@sunum/io/formats";
import { kayitAdi, kayitBicimi, slaytBoyutu, sunuAc, sunuBaytlari, sunumMime } from "./dosya";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../vendor/officehere/apps/sunum/src/io/__fixtures__");
const oku = (ad: string) => {
  const b = readFileSync(path.join(FIX, ad));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe("kaydetme biçimi ve adı", () => {
  it("yazılabilen biçim aynen, yazılamayan .pptx olur", () => {
    expect(kayitBicimi("pptx")).toEqual({ bicim: "pptx", donusur: false });
    expect(kayitBicimi("odp")).toEqual({ bicim: "odp", donusur: false });
    expect(kayitBicimi("ppsx")).toEqual({ bicim: "ppsx", donusur: false });
    for (const f of ["ppt", "pptm", "ppsm", "potm", "otp", "bilinmeyen"]) expect(kayitBicimi(f)).toEqual({ bicim: "pptx", donusur: true });
  });

  it("dosya adı biçime göre", () => {
    expect(kayitAdi("rapor.ppt", "pptx")).toBe("rapor.pptx");
    expect(kayitAdi("Sunu1.pptx", "odp")).toBe("Sunu1.odp");
    expect(kayitAdi("çeyrek.sonuç.pptm", "pptx")).toBe("çeyrek.sonuç.pptx");
    expect(kayitAdi("", "pptx")).toBe("Sunu.pptx");
  });

  it("dosya türleri", () => {
    expect(sunumMime("a.pptx")).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(sunumMime("a.odp")).toBe("application/vnd.oasis.opendocument.presentation");
    expect(sunumMime("a.ppsx")).toContain("slideshow");
  });

  it("slayt boyutu bilgisi", () => {
    expect(slaytBoyutu({ width: 1280, height: 720 })).toBe("Geniş ekran (16:9) · 33,87 × 19,05 cm");
    expect(slaytBoyutu({ width: 960, height: 720 })).toMatch(/^Standart \(4:3\)/);
  });
});

describe("açma ve yazma (masaüstü okuyucu/yazıcıları)", () => {
  it("yeni sunu: varsayılan tek başlık slaydı", async () => {
    const r = await sunuAc({ name: "Sunu1.pptx", data: null, app: "sunum" });
    expect(r.yeni).toBe(true);
    expect(r.pres.slides).toHaveLength(1);
    expect(r.pres.layouts.find((l) => l.id === r.pres.slides[0].layoutId)?.type).toBe("title");
  });

  it("biçim bildirimleri: eski biçim, gösteri, şablon", async () => {
    const ppt = await sunuAc({ name: "lo-bicim.ppt", data: oku("lo-bicim.ppt"), app: "sunum" });
    expect(ppt.bicim).toBe("ppt");
    expect(ppt.bildirim).toMatch(/97-2003/);
    const ppsx = await sunuAc({ name: "lo-bicim.ppsx", data: oku("lo-bicim.ppsx"), app: "sunum" });
    expect(ppsx.gosteri).toBe(true);
    const otp = await sunuAc({ name: "lo-bicim.otp", data: oku("lo-bicim.otp"), app: "sunum" });
    expect(otp.yeni).toBe(true);
    expect(otp.ad).toBe("lo-bicim.pptx");
  });

  it(".ppt → .pptx ve .odp gidiş-dönüşte slaytlar ve notlar korunur", async () => {
    const { pres } = await sunuAc({ name: "lo-proje.ppt", data: oku("lo-proje.ppt"), app: "sunum" });
    for (const bicim of ["pptx", "odp"] as const) {
      const bytes = await sunuBaytlari(pres, bicim, `lo-proje.${bicim}`);
      const geri = await readPresentationFile(bytes, `lo-proje.${bicim}`);
      expect(geri.format).toBe(bicim);
      expect(geri.pres.slides).toHaveLength(pres.slides.length);
      expect(geri.pres.slides.map((s) => s.notes.trim())).toEqual(pres.slides.map((s) => s.notes.trim()));
      expect(geri.pres.props.title).toBeTruthy();
    }
  });
});
