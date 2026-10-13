import { describe, expect, it } from "vitest";
import { Controller } from "@tablo/controller";
import { WorkbookModel } from "@tablo/model/workbook";
import * as E from "@tablo/actions/edit";
import { statusText } from "./stats";

function newBook(): Controller {
  const ctl = new Controller();
  ctl.load(new WorkbookModel(), "Kitap1.xlsx", null);
  return ctl;
}

/** Formül çubuğundaki gibi: yaz ve Enter (aşağı geç). */
function enter(ctl: Controller, text: string) {
  ctl.startEdit(undefined, true);
  ctl.updateEdit(text, text.length);
  expect(ctl.commitEdit("down")).toBe(true);
}

describe("formül girişi", () => {
  it("Türkçe işlev adıyla hesaplar, Enter aşağı geçer", () => {
    const ctl = newBook();
    enter(ctl, "5");
    expect(ctl.activeAddress()).toBe("A2");
    enter(ctl, "7");
    enter(ctl, "=TOPLA(A1:A2)");
    expect(ctl.activeAddress()).toBe("A4");
    const sh = ctl.sheet;
    expect(ctl.wb.getValue(sh, 2, 0)).toBe(12);
    expect(ctl.wb.editText(sh, 2, 0)).toBe("=TOPLA(A1:A2)");
    expect(ctl.wb.getFormula(sh, 2, 0)).toBe("=SUM(A1:A2)");
    expect(ctl.dirty).toBe(true);
  });

  it("bağımlı hücreler güncellenir, geri al/yinele çalışır", () => {
    const ctl = newBook();
    enter(ctl, "5");
    enter(ctl, "7");
    enter(ctl, "=TOPLA(A1:A2)*2");
    const sh = ctl.sheet;
    expect(ctl.wb.getValue(sh, 2, 0)).toBe(24);
    ctl.selectCell(0, 0);
    enter(ctl, "10");
    expect(ctl.wb.getValue(sh, 2, 0)).toBe(34);
    E.undo(ctl);
    expect(ctl.wb.getValue(sh, 2, 0)).toBe(24);
    E.redo(ctl);
    expect(ctl.wb.getValue(sh, 2, 0)).toBe(34);
  });

  it("hatalı formül onaylanmaz", () => {
    const ctl = newBook();
    let alerted = "";
    ctl.alert = (m) => (alerted = m);
    ctl.startEdit("=1+", true);
    expect(ctl.commitEdit("down")).toBe(false);
    expect(alerted).toContain("formül");
  });

  it("Otomatik Toplam üstteki sayıları önerir", () => {
    const ctl = newBook();
    enter(ctl, "1");
    enter(ctl, "2");
    enter(ctl, "3");
    E.autoSum(ctl);
    expect(ctl.edit?.text).toBe("=TOPLA(A1:A3)");
    expect(ctl.commitEdit(null)).toBe(true);
    expect(ctl.wb.getValue(ctl.sheet, 3, 0)).toBe(6);
  });
});

describe("alt satır bilgisi", () => {
  it("tek hücrede adres ve değer, aralıkta Toplam/Ortalama/Sayı", () => {
    const ctl = newBook();
    enter(ctl, "5");
    enter(ctl, "7");
    enter(ctl, "=TOPLA(A1:A2)");
    ctl.selectCell(2, 0);
    expect(statusText(ctl)).toBe("A3: 12");
    ctl.selectRange({ r1: 0, c1: 0, r2: 2, c2: 0 });
    expect(statusText(ctl)).toBe("Toplam: 24 · Ortalama: 8 · Sayı: 3");
    ctl.selectCell(5, 3);
    expect(statusText(ctl)).toBe("D6");
  });
});
