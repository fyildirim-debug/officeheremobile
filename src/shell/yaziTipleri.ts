// Mobilde sunulan yazı tipleri: masaüstü yazı tipi listesinden yaygın olanlar (Belge ve Tablo).
import { FONT_LIST } from "@officehere/core";

const YAZI_TIPLERI = new Set(["Aptos", "Arial", "Calibri", "Cambria", "Comic Sans MS", "Courier New", "Garamond", "Georgia", "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana"]);
export const MOBIL_YAZI_TIPLERI = FONT_LIST.filter((f) => YAZI_TIPLERI.has(f));

/** Seçili yazı tipi listede yoksa başa eklenir (dosyadan gelen yazı tipi kaybolmasın). */
export const yaziTipiListesi = (secili: string) => (MOBIL_YAZI_TIPLERI.includes(secili) ? MOBIL_YAZI_TIPLERI : [secili, ...MOBIL_YAZI_TIPLERI]);
