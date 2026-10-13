// e2e örnek dosyası (e2e/fixtures/tablo/grafikli.xlsx) masaüstü yazıcısıyla (writeXlsx) üretilir:
// grafik, resim, dolgular, kenarlıklar, birleştirme, dondurulmuş bölme, koşullu biçim, mini grafik,
// gizli sayfa. Yeniden üretmek için: TABLO_URET=1 npx vitest run src/tablo/fixture.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { WorkbookModel, type CellInput } from "@tablo/model/workbook";
import { readXlsx, writeXlsx } from "@tablo/io/xlsx";
import { Controller } from "@tablo/controller";
import { insertSlicers } from "@tablo/actions/slicers";
import { applyPivot, createPivot } from "@tablo/pivot/pivotOps";
import { rect } from "@tablo/model/rect";

const OUT = path.resolve(__dirname, "../../e2e/fixtures/tablo/grafikli.xlsx");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8Dwn4GBgYGJAQoAAAD//wMAAP//AwDsAD8AAAAASUVORK5CYII=";

function grafikliKitap(): WorkbookModel {
  const wb = new WorkbookModel(true);
  const s = wb.addSheet("Satışlar");
  const o = wb.addSheet("Özet");
  const g = wb.addSheet("Gizli");
  g.hidden = true;
  const set = (sh: typeof s, r: number, c: number, v: CellInput) => wb.setInputRaw(sh, r, c, v);
  set(s, 0, 0, "Aylık satışlar");
  s.merges.push({ r1: 0, c1: 0, r2: 0, c2: 3 });
  wb.setStyleRaw(s, 0, 0, wb.styles.intern({ bold: true, size: 14, hAlign: "center", fill: "#1F4E79", color: "#FFFFFF" }));
  const head = wb.styles.intern({ bold: true, fill: "#C6EFCE", color: "#006100", bBottom: { style: "medium", color: "#000000" }, hAlign: "center" });
  ["Ay", "Gelir", "Gider", "Kâr"].forEach((h, c) => {
    set(s, 1, c, h);
    wb.setStyleRaw(s, 1, c, head);
  });
  const money = wb.styles.intern({ numFmt: '#,##0.00 "₺"', bBottom: { style: "thin", color: "#000000" } });
  const rows: [string, number, number][] = [
    ["Ocak", 1200, 800],
    ["Şubat", 1500, 900],
    ["Mart", 1100, 1000],
    ["Nisan", 1800, 950],
    ["Mayıs", 2100, 1200],
  ];
  rows.forEach(([ay, gelir, gider], i) => {
    const r = i + 2;
    set(s, r, 0, ay);
    set(s, r, 1, gelir);
    set(s, r, 2, gider);
    set(s, r, 3, { formula: `=B${r + 1}-C${r + 1}` });
    for (let c = 1; c <= 3; c++) wb.setStyleRaw(s, r, c, money);
  });
  set(s, 7, 0, "Toplam");
  wb.setStyleRaw(s, 7, 0, wb.styles.intern({ bold: true, italic: true }));
  for (let c = 1; c <= 3; c++) {
    const col = "ABCD"[c];
    set(s, 7, c, { formula: `=SUM(${col}3:${col}7)` });
    wb.setStyleRaw(s, 7, c, wb.styles.intern({ bold: true, numFmt: '#,##0.00 "₺"', bTop: { style: "thin", color: "#000000" }, bBottom: { style: "double", color: "#000000" } }));
  }
  s.cols.set(0, 90);
  s.cols.set(1, 100);
  s.cols.set(2, 100);
  s.cols.set(3, 100);
  s.frozen = { rows: 2, cols: 0 };
  s.condFormats.push({ id: "cf1", type: "dataBar", color: "#638EC6", ranges: [{ r1: 2, c1: 1, r2: 6, c2: 1 }] });
  s.condFormats.push({ id: "cf2", type: "cellIs", operator: "greaterThan", values: ["=800"], ranges: [{ r1: 2, c1: 3, r2: 6, c2: 3 }], style: { fill: "#FFC7CE", color: "#9C0006" } });
  set(s, 1, 4, "Eğilim");
  wb.setStyleRaw(s, 1, 4, head);
  s.sparklines.push({ id: "sp1", type: "line", items: [{ row: 2, col: 4, range: "B3:D3" }, { row: 3, col: 4, range: "B4:D4" }], color: "#376092", markers: true });
  s.charts.push({ id: "c1", type: "column", range: "'Satışlar'!A2:C7", seriesInRows: false, title: "Gelir ve gider", showTitle: true, showLegend: true, legendPos: "bottom", showDataLabels: false, showGridlines: true, palette: 0, style: 1, anchor: { row: 9, col: 0, dx: 4, dy: 4 }, width: 360, height: 220 });
  s.images.push({ id: "i1", name: "Resim 1", src: PNG, anchor: { row: 20, col: 0, dx: 4, dy: 4 }, width: 40, height: 30 });
  set(o, 0, 0, "Toplam kâr");
  set(o, 0, 1, { formula: "='Satışlar'!D8" });
  set(o, 1, 0, "Ortalama gelir");
  set(o, 1, 1, { formula: "=AVERAGE('Satışlar'!B3:B7)" });
  set(g, 0, 0, "gizli sayfa");
  // Özet sayfasında tablo + dilimleyici ve özet tablo
  ["Ürün", "Adet"].forEach((h, c) => set(o, 3, c, h));
  [["Çay", 3], ["Kahve", 5], ["Çay", 2]].forEach(([u, a], i) => {
    set(o, 4 + i, 0, u);
    set(o, 4 + i, 1, a);
  });
  o.tables.push({ id: "tbl1", name: "Tablo1", ref: { r1: 3, c1: 0, r2: 6, c2: 1 }, style: "TableStyleMedium2", headerRow: true, totalRow: false, bandedRows: true, bandedCols: false, firstColumn: false, lastColumn: false, filterButton: true, columns: ["Ürün", "Adet"] });
  wb.engine.recalc();
  const ctl = new Controller(wb);
  ctl.load(wb, "grafikli.xlsx", null);
  wb.activeIndex = 1;
  insertSlicers(ctl, { kind: "table", tableId: "tbl1" }, [{ name: "Ürün" }]);
  createPivot(ctl, s, rect(1, 0, 6, 2), { sheet: o, row: 9, col: 0 });
  // Özet tablo: aylara göre gelir toplamı (hücrelere yazılır; ızgarada salt görüntülenir)
  applyPivot(ctl, o, o.pivots[0].id, (d) => {
    d.rows = [0];
    d.values = [{ field: 1, fn: "sum" }];
  });
  wb.activeIndex = 0;
  wb.engine.recalc();
  return wb;
}

it("grafikli.xlsx örnek dosyası", async () => {
  if (process.env.TABLO_URET) writeFileSync(OUT, await writeXlsx(grafikliKitap()));
  const b = readFileSync(OUT);
  const wb = await readXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const s = wb.sheets[0];
  expect(wb.sheets.map((x) => [x.name, x.hidden])).toEqual([
    ["Satışlar", false],
    ["Özet", false],
    ["Gizli", true],
  ]);
  expect(s.charts.map((c) => c.title)).toEqual(["Gelir ve gider"]);
  expect(s.images).toHaveLength(1);
  expect(s.sparklines).toHaveLength(1);
  expect(wb.getValue(s, 7, 3)).toBe(2850);
  expect(wb.sheets[1].slicers).toHaveLength(1);
  expect(wb.sheets[1].pivots).toHaveLength(1);
});
