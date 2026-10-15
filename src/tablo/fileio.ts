// Tablo dosya girişi/çıkışı: masaüstü okuyucu ve yazıcıları (io/formats) üzerine ince katman.
import { openBook, writableAs, writeBook, type BookFormat, type SaveFormat } from "@tablo/io/formats";
import { decodeText, detectDelimiter } from "@tablo/io/csv";
import { fileFormatOf, setFileFormat } from "@tablo/app/fileFormat";
import type { SheetModel, WorkbookModel } from "@tablo/model/workbook";
import { baseOf, extOf } from "../platform/formats";

export interface OpenedWorkbook {
  wb: WorkbookModel;
  /** Ekranda gösterilecek ad (şablon açılınca "Ad1.xlsx"). */
  name: string;
  format: BookFormat;
  template: boolean;
  /** Kullanıcıya bildirilecek iletiler (uyumluluk kipi, makrolar, atlanan öğeler). */
  notices: string[];
}

/** Dosyayı masaüstü okuyucusuyla açar; okunamazsa anlaşılır iletiyle hata atar. */
export async function openWorkbook(name: string, data: ArrayBuffer): Promise<OpenedWorkbook> {
  let opened;
  try {
    opened = await openBook(name, data);
  } catch (e) {
    const err = e as Error;
    const msg = err?.message ?? "";
    throw new Error(err?.name === "FormatError" ? msg : `Dosya biçimi geçersiz ya da dosya bozuk olabilir.${msg ? `\n\n${msg}` : ""}`);
  }
  const { wb, format, template } = opened;
  const notices: string[] = [];
  if (opened.notice) notices.push(opened.notice);
  if (wb.loadWarnings.length) notices.push(`Dosyadaki bazı öğeler okunamadı ve atlandı: ${wb.loadWarnings.join(", ")}.`);
  if (template) {
    // Şablon: adsız yeni çalışma kitabı gibi (masaüstündeki gibi "Ad1"), .xlsx olarak kaydedilir
    setFileFormat(wb, { format: "xlsx" });
    return { wb, name: `${baseOf(name)}1.xlsx`, format, template, notices };
  }
  const delimiter = format === "csv" || format === "txt" ? detectDelimiter(decodeText(data)) : format === "tsv" ? "\t" : undefined;
  setFileFormat(wb, { format, delimiter });
  return { wb, name, format, template, notices };
}

export interface SavePlan {
  name: string;
  format: SaveFormat;
  /** Özgün biçim yazılamadığı için .xlsx'e çevrildi. */
  converted: boolean;
}

/**
 * Kaydetme adı ve biçimi. as verilmezse dosya kendi biçiminde (yazılabiliyorsa aynı adla)
 * kaydedilir; makrolu kitap (.xlsm) makrolarıyla .xlsm kalır; .xls ve şablon biçimleri .xlsx olur.
 */
export function planSave(name: string, format: BookFormat, as?: SaveFormat): SavePlan {
  if (as) return { name: `${baseOf(name)}.${as}`, format: as, converted: false };
  const w = writableAs(format);
  if (!w) return { name: `${baseOf(name)}.xlsx`, format: "xlsx", converted: true };
  return { name: extOf(name) ? name : `${name}.${w}`, format: w, converted: false };
}

/** Kitabın kayıtlı biçimi. */
export function bookFormat(wb: WorkbookModel): BookFormat {
  return fileFormatOf(wb).format;
}

/** Bu biçim için ilk kayıtta "bazı özellikler kaybolabilir" sorusu gerekiyor mu? */
export function needsFormatQuestion(wb: WorkbookModel, plan: SavePlan, explicit: boolean): boolean {
  return !explicit && plan.format !== "xlsx" && plan.format !== "xlsm" && !fileFormatOf(wb).confirmed;
}

/** Biçim sorusunun metni (masaüstü SaveFormatDialog ile aynı). */
export function formatQuestion(format: SaveFormat, sheet: string): string {
  if (format === "ods") return "Bu çalışma kitabı OpenDocument Hesap Tablosu (.ods) biçiminde. Bu biçimde bazı özellikler (grafikler, özet tablolar, koşullu biçimlendirme, veri doğrulama gibi) kaybolabilir. Tüm özellikleri korumak için .xlsx olarak kaydedin.";
  const kind = format === "csv" ? "CSV" : "sekmeyle ayrılmış metin (.tsv)";
  return `Bu dosya ${kind} biçiminde. Yalnız etkin sayfa («${sheet}») ve değerler kaydedilir; biçimler, formüller ve diğer sayfalar kaydedilmez. Tüm özellikleri korumak için .xlsx olarak kaydedin.`;
}

/** Çalışma kitabını baytlara çevirir (metin biçimleri UTF-8, BOM'lu). */
export async function workbookBytes(wb: WorkbookModel, sheet: SheetModel, plan: SavePlan): Promise<Uint8Array> {
  const st = fileFormatOf(wb);
  // Dosyanın kendi ayırıcısı yalnız aynı biçimde kaydederken korunur
  const delimiter = writableAs(st.format) === plan.format ? st.delimiter : undefined;
  const out = await writeBook(wb, sheet, plan.format, delimiter);
  return typeof out === "string" ? new TextEncoder().encode(out) : out;
}

/** Başarılı kayıttan sonra kitabın biçim durumu. */
export function markSaved(wb: WorkbookModel, plan: SavePlan): void {
  const prev = fileFormatOf(wb);
  setFileFormat(wb, { format: plan.format, confirmed: true, delimiter: writableAs(prev.format) === plan.format ? prev.delimiter : undefined });
}

export type { SaveFormat };
