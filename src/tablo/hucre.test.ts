// Tablo hücre işlemleri: Türkçe bul/değiştir, pano (kopyala/kes/yapıştır), birleştirme, kenarlık,
// yazı boyutu, sıralama ve filtre; masaüstü eylemleri üzerinden mobil yardımcılar.
import { describe, expect, it, vi } from "vitest";
import { Controller } from "@tablo/controller";
import { WorkbookModel } from "@tablo/model/workbook";
import { clearAllFilters, filtersOf, quickSort, setColumnFilter, toggleAutoFilter } from "@tablo/actions/data";
import { borders, growFont, setFontSize } from "@tablo/actions/format";
import { readXlsx } from "@tablo/io/xlsx";
import { hucrelerdeBul, turkceDesen } from "./bul";
import { birlesik, birlestirVeOrtala, filtreBul } from "./hucre";
import { kopyala, panoyuBirak, yapistir } from "./pano";
import { workbookBytes } from "./fileio";

vi.mock("../shell/feedback", () => ({ toast: vi.fn() }));

function kitap(): Controller {
  const ctl = new Controller();
  ctl.load(new WorkbookModel(), "Kitap1.xlsx", null);
  return ctl;
}

function yaz(ctl: Controller, ref: string, ...degerler: string[]) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
  const col = m[1].charCodeAt(0) - 65;
  let row = Number(m[2]) - 1;
  for (const v of degerler) {
    ctl.selectCell(row++, col);
    ctl.startEdit(undefined, true);
    ctl.updateEdit(v, v.length);
    expect(ctl.commitEdit(null)).toBe(true);
  }
}

const sec = (ctl: Controller, r1: number, c1: number, r2 = r1, c2 = c1) => ctl.selectRange({ r1, c1, r2, c2 });
const deger = (ctl: Controller, row: number, col: number) => ctl.wb.getValue(ctl.sheet, row, col);

describe("Türkçe bul/değiştir deseni", () => {
  it("i↔İ ve ı↔I eşleşir, i↔ı eşleşmez; joker ve kaçış", () => {
    expect(turkceDesen("izmir").test("İZMİR")).toBe(true);
    expect(turkceDesen("İzmir").test("izmir")).toBe(true);
    expect(turkceDesen("ısparta").test("ISPARTA")).toBe(true);
    expect(turkceDesen("çiğ").test("ÇİĞ köfte")).toBe(true);
    expect(turkceDesen("ıi").test("ii")).toBe(false);
    expect(turkceDesen("a*z").test("Ankaraz")).toBe(true);
    expect(turkceDesen("a?a").test("ana")).toBe(true);
    expect(turkceDesen("~*").test("5*3")).toBe(true);
    expect(turkceDesen("~*").test("53")).toBe(false);
    expect(turkceDesen("(1+2)").test("=(1+2)")).toBe(true);
  });

  it("görünen değerde arar; değiştirme formül metninde, geri alınabilir", () => {
    const ctl = kitap();
    yaz(ctl, "A1", "İzmir", "Ankara", "izmir körfezi");
    const hits = hucrelerdeBul(ctl.wb, [ctl.sheet], "izmir");
    expect(hits.map((h) => [h.row, h.col])).toEqual([
      [0, 0],
      [2, 0],
    ]);
    const n = ctl.ops.replaceAll(ctl.sheet, hits, turkceDesen("izmir", true), "Manisa");
    expect(n).toBe(2);
    expect(deger(ctl, 0, 0)).toBe("Manisa");
    expect(deger(ctl, 2, 0)).toBe("Manisa körfezi");
    ctl.ops.history.undo();
    expect(deger(ctl, 0, 0)).toBe("İzmir");
  });
});

describe("pano", () => {
  const platform = () => ({ writeClipboard: vi.fn(async () => {}), readClipboard: vi.fn(async () => null) });

  it("kopyala sistem panosuna metin ve HTML yazar; yapıştır göreli formülü kaydırır", async () => {
    const ctl = kitap();
    yaz(ctl, "A1", "2", "3", "=A1*A2");
    sec(ctl, 0, 0, 2, 0);
    const p = platform();
    expect(await kopyala(ctl, p, false)).toBe(true);
    expect(p.writeClipboard).toHaveBeenCalledWith({ text: expect.stringContaining("2\r\n3"), html: expect.stringContaining("<table") });
    expect(ctl.clip).toMatchObject({ cut: false });
    sec(ctl, 0, 2);
    await yapistir(ctl, p);
    expect(deger(ctl, 2, 2)).toBe(6);
    expect(ctl.wb.editText(ctl.sheet, 2, 2)).toBe("=C1*C2");
    expect(panoyuBirak(ctl)).toBe(true);
    expect(ctl.clip).toBeNull();
  });

  it("kes kaynağı taşır; başka uygulamadan gelen metin sekmelerle bölünür", async () => {
    const ctl = kitap();
    yaz(ctl, "A1", "x");
    sec(ctl, 0, 0);
    const p = platform();
    await kopyala(ctl, p, true);
    sec(ctl, 4, 4);
    await yapistir(ctl, p);
    expect(deger(ctl, 0, 0)).toBeNull();
    expect(deger(ctl, 4, 4)).toBe("x");
    p.readClipboard.mockResolvedValueOnce({ text: "a\tb\r\n1\t2" } as never);
    sec(ctl, 9, 0);
    await yapistir(ctl, p);
    expect([deger(ctl, 9, 0), deger(ctl, 9, 1), deger(ctl, 10, 0), deger(ctl, 10, 1)]).toEqual(["a", "b", 1, 2]);
  });
});

describe("birleştirme, kenarlık, yazı boyutu", () => {
  it("birleştir ve ortala; birleşikte yeniden dokununca çözülür; .xlsx'e yazılır", async () => {
    const ctl = kitap();
    yaz(ctl, "A1", "Başlık");
    sec(ctl, 0, 0, 0, 2);
    birlestirVeOrtala(ctl);
    expect(ctl.sheet.merges).toEqual([{ r1: 0, c1: 0, r2: 0, c2: 2 }]);
    expect(birlesik(ctl)).toBe(true);
    expect(ctl.wb.styleAt(ctl.sheet, 0, 0).hAlign).toBe("center");
    sec(ctl, 1, 1);
    borders(ctl, "all");
    setFontSize(ctl, 16);
    growFont(ctl, 1);
    expect(ctl.wb.styleAt(ctl.sheet, 1, 1)).toMatchObject({ size: 18, bTop: { style: "thin" }, bLeft: { style: "thin" } });
    const bytes = await workbookBytes(ctl.wb, ctl.sheet, { name: "a.xlsx", format: "xlsx", converted: false });
    const wb2 = await readXlsx(bytes.buffer as ArrayBuffer);
    expect(wb2.sheets[0].merges).toEqual([{ r1: 0, c1: 0, r2: 0, c2: 2 }]);
    expect(wb2.styleAt(wb2.sheets[0], 1, 1)).toMatchObject({ size: 18, bBottom: { style: "thin" }, bRight: { style: "thin" } });
    sec(ctl, 0, 1);
    birlestirVeOrtala(ctl);
    expect(ctl.sheet.merges).toEqual([]);
  });
});

describe("sıralama ve filtre", () => {
  it("Türkçe sıralama, değer filtresi, temizleme; filtre .xlsx'e yazılır", async () => {
    const ctl = kitap();
    yaz(ctl, "A1", "Şehir", "İzmir", "Çorum", "Ankara", "Bursa");
    yaz(ctl, "B1", "Adet", "1", "2", "3", "4");
    sec(ctl, 1, 0);
    quickSort(ctl, false);
    expect([1, 2, 3, 4].map((r) => deger(ctl, r, 0))).toEqual(["Ankara", "Bursa", "Çorum", "İzmir"]);
    expect([1, 2, 3, 4].map((r) => deger(ctl, r, 1))).toEqual([3, 4, 2, 1]);
    sec(ctl, 0, 0);
    toggleAutoFilter(ctl);
    const f = filtreBul(ctl, 1)!;
    expect(f).toBeTruthy();
    setColumnFilter(ctl, f, 0, { kind: "values", values: ["Ankara", "İzmir"], blanks: false });
    expect([...ctl.sheet.filterHidden].sort()).toEqual([2, 3]);
    const bytes = await workbookBytes(ctl.wb, ctl.sheet, { name: "a.xlsx", format: "xlsx", converted: false });
    const wb2 = await readXlsx(bytes.buffer as ArrayBuffer);
    expect(filtersOf(wb2.sheets[0])[0]?.range).toMatchObject({ r1: 0, c1: 0, c2: 1 });
    clearAllFilters(ctl);
    expect(ctl.sheet.filterHidden.size).toBe(0);
  });
});
