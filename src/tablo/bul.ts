// Tablo'da bul ve değiştir: Türkçe büyük/küçük harf eşlemesiyle (i↔İ, ı↔I; Belge'deki gibi) ve masaüstü
// joker karakterleriyle (* ? ~). Masaüstü desenindeki "iu" bayrağı İ/ı harflerini eşlemediği için
// arama burada kurulur; değiştirme masaüstü ops.replaceAll ile (tek geri alma adımı) yapılır.
import type { WorkbookModel, SheetModel } from "@tablo/model/workbook";
import type { FindHit } from "@tablo/model/find";
import { displayText } from "@tablo/model/display";

const kacis = (c: string) => c.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

/** Arama deseni: her harf Türkçe büyük/küçük karşılığıyla eşleşir; * ? joker, ~ kaçış. */
export function turkceDesen(sorgu: string, global = false): RegExp {
  let src = "";
  const harfler = [...sorgu];
  for (let i = 0; i < harfler.length; i++) {
    const c = harfler[i];
    if (c === "~" && i + 1 < harfler.length && "*?~".includes(harfler[i + 1])) {
      src += kacis(harfler[++i]);
      continue;
    }
    if (c === "*") {
      src += "[\\s\\S]*";
      continue;
    }
    if (c === "?") {
      src += "[\\s\\S]";
      continue;
    }
    const es = new Set([c, c.toLocaleLowerCase("tr-TR"), c.toLocaleUpperCase("tr-TR")].filter((x) => [...x].length === 1));
    src += es.size > 1 ? `[${[...es].map(kacis).join("")}]` : kacis(c);
  }
  return new RegExp(src, global ? "gu" : "u");
}

/** Görünen değerlerde arar (gizli olmayan sayfalar, satır sonra sütun sırasıyla). */
export function hucrelerdeBul(wb: WorkbookModel, sayfalar: SheetModel[], sorgu: string): FindHit[] {
  const q = sorgu.trim();
  if (!q) return [];
  const re = turkceDesen(q);
  const out: FindHit[] = [];
  for (const sheet of sayfalar) {
    const hucreler: [number, number][] = [];
    const gorulen = new Set<number>();
    wb.engine.forEachValue(sheet.id, (r, c, v) => {
      if (v === null) return;
      const k = r * 16384 + c;
      if (!gorulen.has(k)) (gorulen.add(k), hucreler.push([r, c]));
    });
    const bulunan: FindHit[] = [];
    for (const [row, col] of hucreler) {
      const text = displayText(wb, sheet, row, col);
      if (text && re.test(text)) bulunan.push({ sheet, row, col, text });
    }
    bulunan.sort((a, b) => a.row - b.row || a.col - b.col);
    out.push(...bulunan);
  }
  return out;
}
