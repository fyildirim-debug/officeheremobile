import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WorkbookModel } from "@tablo/model/workbook";
import { setFileFormat } from "@tablo/app/fileFormat";
import { bookFormat, markSaved, needsFormatQuestion, openWorkbook, planSave, workbookBytes } from "./fileio";

const FIX = path.resolve(__dirname, "../../vendor/officehere/apps/tablo/src/io/__fixtures__");
const read = (name: string) => {
  const b = readFileSync(path.join(FIX, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe("kaydetme adı ve biçimi", () => {
  it("yazılabilen biçim aynı adla", () => {
    expect(planSave("rapor.xlsx", "xlsx")).toEqual({ name: "rapor.xlsx", format: "xlsx", converted: false });
    expect(planSave("veri.ods", "ods")).toEqual({ name: "veri.ods", format: "ods", converted: false });
    expect(planSave("liste.csv", "csv")).toEqual({ name: "liste.csv", format: "csv", converted: false });
    expect(planSave("liste.tsv", "tsv")).toEqual({ name: "liste.tsv", format: "tsv", converted: false });
    // Makrolu kitap makrolarıyla aynı biçimde kalır (masaüstüyle aynı; makrolar çalıştırılmaz).
    expect(planSave("makro.xlsm", "xlsm")).toEqual({ name: "makro.xlsm", format: "xlsm", converted: false });
    expect(planSave("Kitap1", "xlsx")).toEqual({ name: "Kitap1.xlsx", format: "xlsx", converted: false });
  });

  it("yazılamayan biçim .xlsx olur", () => {
    expect(planSave("eski.xls", "xls")).toEqual({ name: "eski.xlsx", format: "xlsx", converted: true });
    expect(planSave("sablon.xltx", "xltx")).toEqual({ name: "sablon.xlsx", format: "xlsx", converted: true });
  });

  it("Farklı kaydet biçimi değiştirir", () => {
    expect(planSave("rapor.xlsx", "xlsx", "ods")).toEqual({ name: "rapor.ods", format: "ods", converted: false });
    expect(planSave("eski.xls", "xls", "csv")).toEqual({ name: "eski.csv", format: "csv", converted: false });
  });

  it("ODS/CSV ilk kayıtta bir kez sorulur; .xlsm sorulmaz", () => {
    const xlsm = new WorkbookModel();
    setFileFormat(xlsm, { format: "xlsm" });
    expect(needsFormatQuestion(xlsm, planSave("m.xlsm", "xlsm"), false)).toBe(false);
    const wb = new WorkbookModel();
    setFileFormat(wb, { format: "csv", delimiter: ";" });
    const plan = planSave("a.csv", bookFormat(wb));
    expect(needsFormatQuestion(wb, plan, false)).toBe(true);
    expect(needsFormatQuestion(wb, plan, true)).toBe(false);
    markSaved(wb, plan);
    expect(needsFormatQuestion(wb, plan, false)).toBe(false);
  });
});

describe("açma", () => {
  it("ods: sayfalar, gizli sayfa ve değerler", async () => {
    const o = await openWorkbook("ornek.ods", read("ornek.ods"));
    expect(o.format).toBe("ods");
    expect(o.wb.sheets.map((s) => s.name)).toEqual(["Satışlar", "Özet", "Uzun", "Gizli"]);
    expect(o.wb.sheets[3].hidden).toBe(true);
    expect(o.wb.getValue(o.wb.sheets[0], 0, 0)).toBe("Ürün");
  });

  it("xls uyumluluk iletisiyle açılır", async () => {
    const o = await openWorkbook("ornek.xls", read("ornek.xls"));
    expect(o.format).toBe("xls");
    expect(o.notices.join(" ")).toContain("97-2003");
    expect(planSave(o.name, bookFormat(o.wb)).name).toBe("ornek.xlsx");
  });

  it("şablon adsız yeni kitap olur", async () => {
    const o = await openWorkbook("sablon.xltx", read("sablon.xltx"));
    expect(o.template).toBe(true);
    expect(o.name).toBe("sablon1.xlsx");
    expect(planSave(o.name, bookFormat(o.wb))).toEqual({ name: "sablon1.xlsx", format: "xlsx", converted: false });
  });

  it("tüm Tablo biçimleri masaüstü okuyucularıyla açılır", async () => {
    const cases: [string, string, boolean][] = [
      ["sablon.xlsm", "xlsm", false],
      ["sablon.xltm", "xltm", true],
      ["sablon.ots", "ots", true],
      ["tarih1904.xls", "xls", false],
      ["tarih1904.ods", "ods", false],
    ];
    for (const [name, format, template] of cases) {
      const o = await openWorkbook(name, read(name));
      expect(o.format).toBe(format);
      expect(o.template).toBe(template);
      expect(o.wb.sheets.length).toBeGreaterThan(0);
    }
    const tsv = await openWorkbook("veri.tsv", new TextEncoder().encode("a\tb\n1\t2\n").buffer as ArrayBuffer);
    expect(tsv.format).toBe("tsv");
    expect(tsv.wb.getValue(tsv.wb.sheets[0], 1, 1)).toBe(2);
    expect(planSave("sablon.xlsm", "xlsm").converted).toBe(false);
    expect(planSave("sablon.xltm", "xltm").converted).toBe(true);
  });

  it("şifreli dosyada anlaşılır hata", async () => {
    await expect(openWorkbook("sifreli.xls", read("sifreli.xls"))).rejects.toThrow(/parola/i);
  });

  it("bozuk dosyada anlaşılır hata", async () => {
    const junk = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]).buffer;
    await expect(openWorkbook("bozuk.xlsx", junk)).rejects.toThrow(/bozuk/i);
  });

  it("csv ayırıcısı korunur", async () => {
    const data = new TextEncoder().encode("Ad;Tutar\nÇay;12,5\n").buffer as ArrayBuffer;
    const o = await openWorkbook("liste.csv", data);
    expect(o.format).toBe("csv");
    expect(o.wb.getValue(o.wb.sheets[0], 1, 1)).toBe(12.5);
    const bytes = await workbookBytes(o.wb, o.wb.sheets[0], planSave("liste.csv", "csv"));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("Çay;12,5");
  });
});

describe("kaydetme", () => {
  it("xlsx gidiş-dönüş: değerler, formül ve biçim korunur", async () => {
    const wb = new WorkbookModel();
    const sh = wb.active;
    wb.setInputRaw(sh, 0, 0, 5);
    wb.setInputRaw(sh, 1, 0, 7);
    wb.setInputRaw(sh, 2, 0, { formula: "=SUM(A1:A2)" });
    wb.setStyleRaw(sh, 0, 0, wb.styles.intern({ bold: true, fill: "#FFFF00" }));
    wb.engine.recalc();
    const bytes = await workbookBytes(wb, sh, planSave("Kitap1.xlsx", "xlsx"));
    const back = await openWorkbook("Kitap1.xlsx", bytes.slice().buffer as ArrayBuffer);
    const s = back.wb.sheets[0];
    expect(back.wb.getValue(s, 2, 0)).toBe(12);
    expect(back.wb.getFormula(s, 2, 0)).toBe("=SUM(A1:A2)");
    expect(back.wb.styleAt(s, 0, 0)).toMatchObject({ bold: true, fill: "#FFFF00" });
  });

  it("grafikli dosyada grafik ve resim korunur", async () => {
    const b = readFileSync(path.resolve(__dirname, "../../e2e/fixtures/tablo/grafikli.xlsx"));
    const o = await openWorkbook("grafikli.xlsx", b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const bytes = await workbookBytes(o.wb, o.wb.sheets[0], planSave("grafikli.xlsx", "xlsx"));
    const back = await openWorkbook("grafikli.xlsx", bytes.slice().buffer as ArrayBuffer);
    const s = back.wb.sheets[0];
    expect(s.charts).toHaveLength(1);
    expect(s.images).toHaveLength(1);
    expect(s.frozen).toEqual({ rows: 2, cols: 0 });
    expect(back.wb.sheets.find((x) => x.name === "Gizli")?.hidden).toBe(true);
  });
});
