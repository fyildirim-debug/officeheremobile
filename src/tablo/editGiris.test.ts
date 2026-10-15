import { describe, expect, it } from "vitest";
import { Controller } from "@tablo/controller";
import { WorkbookModel } from "@tablo/model/workbook";
import { setNumFmt } from "@tablo/actions/format";
import { klavyeTuru, ondalikVirgul, satirSonuEkle } from "./editGiris";

function newBook(): Controller {
  const ctl = new Controller();
  ctl.load(new WorkbookModel(), "Kitap1.xlsx", null);
  return ctl;
}

/** Hücreye formül çubuğundaki gibi yazar. */
function yaz(ctl: Controller, row: number, col: number, text: string) {
  ctl.selectCell(row, col);
  ctl.startEdit(undefined, true);
  ctl.updateEdit(text, text.length);
  expect(ctl.commitEdit(null)).toBe(true);
}

const tur = (ctl: Controller, row: number, col: number) => klavyeTuru(ctl.wb, ctl.sheet, row, col);

describe("hücreye göre ekran klavyesi", () => {
  it("sayı hücresinde sayısal, metin ve formülde harf klavyesi", () => {
    const ctl = newBook();
    yaz(ctl, 0, 0, "12,5");
    yaz(ctl, 0, 1, "Elma");
    yaz(ctl, 0, 2, "=A1*2");
    yaz(ctl, 0, 3, "15.10.2026");
    yaz(ctl, 0, 4, "%15");
    expect(tur(ctl, 0, 0)).toBe("decimal");
    expect(tur(ctl, 0, 1)).toBe("text");
    expect(tur(ctl, 0, 2)).toBe("text");
    // Tarih sayıdır ama noktalı yazılır: harf klavyesi
    expect(tur(ctl, 0, 3)).toBe("text");
    expect(tur(ctl, 0, 4)).toBe("decimal");
  });

  it("boş hücre: üstteki (yoksa soldaki) dolu hücre sayıysa sayısal", () => {
    const ctl = newBook();
    expect(tur(ctl, 0, 0)).toBe("text");
    yaz(ctl, 0, 0, "Miktar");
    expect(tur(ctl, 1, 0)).toBe("text");
    yaz(ctl, 1, 0, "3");
    expect(tur(ctl, 2, 0)).toBe("decimal");
    // Üstü boş, solu sayı
    expect(tur(ctl, 1, 1)).toBe("decimal");
    // Üstü metin: üstteki karar verir
    expect(tur(ctl, 1, 0)).toBe("decimal");
    yaz(ctl, 2, 0, "Toplam");
    expect(tur(ctl, 3, 0)).toBe("text");
  });

  it("sayı biçimli boş hücre sayısal, metin (@) ve tarih biçimli harf klavyesi", () => {
    const ctl = newBook();
    ctl.selectCell(4, 4);
    setNumFmt(ctl, "#,##0.00 ₺");
    expect(tur(ctl, 4, 4)).toBe("decimal");
    ctl.selectCell(5, 5);
    setNumFmt(ctl, "@");
    expect(tur(ctl, 5, 5)).toBe("text");
    ctl.selectCell(6, 6);
    setNumFmt(ctl, "dd.mm.yyyy");
    expect(tur(ctl, 6, 6)).toBe("text");
  });
});

describe("sayısal klavyede ondalık ayırıcı", () => {
  it("rakamlardan sonraki nokta virgül olur", () => {
    expect(ondalikVirgul("3.", 2)).toBe("3,");
    expect(ondalikVirgul("-12.", 4)).toBe("-12,");
    // Ortada yazılan nokta (sonrası rakam)
    expect(ondalikVirgul("12.5", 3)).toBe("12,5");
    expect(ondalikVirgul(".", 1)).toBe(",");
  });

  it("zaten ayırıcı varsa ya da metinse dokunulmaz", () => {
    expect(ondalikVirgul("3,5.", 4)).toBeNull();
    expect(ondalikVirgul("1.234.", 6)).toBeNull();
    expect(ondalikVirgul("a.", 2)).toBeNull();
    expect(ondalikVirgul("3,", 2)).toBeNull();
  });

  it("virgüllü giriş sayı olur, noktalı giriş tarih olurdu", () => {
    const ctl = newBook();
    yaz(ctl, 0, 0, ondalikVirgul("3.", 2)! + "5");
    expect(ctl.wb.getValue(ctl.sheet, 0, 0)).toBe(3.5);
    yaz(ctl, 1, 0, "3.5");
    expect(ctl.wb.getValue(ctl.sheet, 1, 0)).not.toBe(3.5);
    yaz(ctl, 2, 0, ondalikVirgul(".", 1)! + "25");
    expect(ctl.wb.getValue(ctl.sheet, 2, 0)).toBe(0.25);
  });
});

describe("satır sonu", () => {
  it("seçimin yerine satır sonu; hücre metni kaydırılır", () => {
    expect(satirSonuEkle("Ad Soyad", 2, 3)).toEqual({ text: "Ad\nSoyad", caret: 3 });
    expect(satirSonuEkle("abc", 3, 3)).toEqual({ text: "abc\n", caret: 4 });
    const ctl = newBook();
    const r = satirSonuEkle("Satır 1", 7, 7);
    yaz(ctl, 0, 0, `${r.text}Satır 2`);
    expect(ctl.wb.getValue(ctl.sheet, 0, 0)).toBe("Satır 1\nSatır 2");
    expect(ctl.wb.styleAt(ctl.sheet, 0, 0).wrap).toBe(true);
  });
});

describe("Enter ↓ / Sekme →", () => {
  it("Sekmelerle sağa, Enter'la başlangıç sütununun altına; Shift ters yön", () => {
    const ctl = newBook();
    const gir = (t: string, yon: "down" | "right" | "up" | "left") => {
      ctl.startEdit(undefined, true);
      ctl.updateEdit(t, t.length);
      expect(ctl.commitEdit(yon)).toBe(true);
    };
    gir("a", "right");
    expect(ctl.activeAddress()).toBe("B1");
    gir("b", "right");
    gir("c", "down");
    expect(ctl.activeAddress()).toBe("A2");
    gir("d", "down");
    expect(ctl.activeAddress()).toBe("A3");
    // Düzenleme yokken (formül çubuğunda) Enter/Sekme aynı ilerlemeyi kullanır
    ctl.advance("right");
    expect(ctl.activeAddress()).toBe("B3");
    ctl.advance("left");
    expect(ctl.activeAddress()).toBe("A3");
    ctl.advance("up");
    expect(ctl.activeAddress()).toBe("A2");
  });
});
