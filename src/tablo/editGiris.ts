// Mobil veri girişi: hücreye göre ekran klavyesi (sayı hücresinde sayısal klavye), sayısal klavyedeki
// noktanın Türkçe ondalık virgüle çevrilmesi ve satır sonu (Alt+Enter karşılığı) ekleme.
import { isDateFormat, isTextFormat } from "@officehere/formula";
import type { SheetModel, WorkbookModel } from "@tablo/model/workbook";

/** Formül çubuğunun `inputmode` değeri. */
export type KlavyeTuru = "decimal" | "text";

/** Hücre sayı mı (tarih/saat biçimli sayılar ve formüller sayılmaz)? null: boş. */
function sayiMi(wb: WorkbookModel, sheet: SheetModel, row: number, col: number): boolean | null {
  if (row < 0 || col < 0) return null;
  if (wb.getFormula(sheet, row, col)) return false;
  const v = wb.getValue(sheet, row, col);
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "number" && !isDateFormat(wb.styleAt(sheet, row, col).numFmt);
}

/**
 * Hücrenin ekran klavyesi. Sayı içeren hücrede ve sayı biçimli boş hücrede sayısal klavye; boş hücrede
 * üstteki (yoksa soldaki) dolu hücre sayıysa da sayısal (sütuna art arda sayı girilirken her hücrede).
 * Tarih/saat biçimi, metin biçimi (@) ve formül harf klavyesi ister.
 */
export function klavyeTuru(wb: WorkbookModel, sheet: SheetModel, row: number, col: number): KlavyeTuru {
  const kendi = sayiMi(wb, sheet, row, col);
  if (kendi !== null) return kendi ? "decimal" : "text";
  const fmt = wb.styleAt(sheet, row, col).numFmt;
  if (isTextFormat(fmt) || isDateFormat(fmt)) return "text";
  if (fmt && fmt !== "General") return "decimal";
  const komsu = sayiMi(wb, sheet, row - 1, col) ?? sayiMi(wb, sheet, row, col - 1);
  return komsu ? "decimal" : "text";
}

/**
 * Sayısal klavyedeki nokta (bazı klavyelerde tek ondalık tuşu) Türkçe ondalık virgüle çevrilir; yoksa
 * "3.5" 3 Mayıs tarihi olur. Yalnız rakamlardan sonra (ya da başta) yazılan ilk ayırıcı çevrilir; çevrilecekse yeni metni döner.
 */
export function ondalikVirgul(metin: string, imlec: number): string | null {
  const once = metin.slice(0, imlec - 1);
  const sonra = metin.slice(imlec);
  if (metin[imlec - 1] !== "." || !/^[-+]?\d*$/.test(once) || !/^\d*$/.test(sonra)) return null;
  return `${once},${sonra}`;
}

/** Seçimin yerine satır sonu (Alt+Enter); yeni metin ve imleç. */
export function satirSonuEkle(metin: string, bas: number, son: number): { text: string; caret: number } {
  return { text: `${metin.slice(0, bas)}\n${metin.slice(son)}`, caret: bas + 1 };
}
