// Seçim istatistikleri (masaüstü durum çubuğundaki Ortalama/Sayım/Toplam ile aynı kural).
import { addr, formatValue } from "@officehere/formula";
import type { Controller } from "@tablo/controller";
import { displayText } from "@tablo/model/display";

export interface SelectionStats {
  /** Boş olmayan hücre sayısı (hatalar dahil). */
  count: number;
  /** Sayısal hücre sayısı. */
  nums: number;
  sum: number;
}

/** Seçimdeki değerler; ikiden az dolu hücre varsa null. Gizli satırlar sayılmaz. */
export function selectionStats(ctl: Controller): SelectionStats | null {
  const { wb, sheet } = ctl;
  const ext = wb.dataExtent(sheet);
  let count = 0;
  let nums = 0;
  let sum = 0;
  const seen = new Set<number>();
  const visit = (row: number, col: number, v: unknown) => {
    const k = row * 16384 + col;
    if (seen.has(k)) return;
    seen.add(k);
    if (v === null || v === undefined) return;
    count++;
    if (typeof v === "number") {
      nums++;
      sum += v;
    }
  };
  for (const r of ctl.sel.ranges) {
    const r2 = Math.min(r.r2, ext.rows - 1);
    const c2 = Math.min(r.c2, ext.cols - 1);
    const area = (r2 - r.r1 + 1) * (c2 - r.c1 + 1);
    if (area <= 0) continue;
    if (area > 400_000) {
      wb.engine.forEachValue(sheet.id, (row, col, v) => {
        if (row < r.r1 || row > r2 || col < r.c1 || col > c2 || sheet.rows.isHidden(row)) return;
        visit(row, col, v);
      });
      continue;
    }
    for (let i = r.r1; i <= r2; i++) {
      if (sheet.rows.isHidden(i)) continue;
      for (let j = r.c1; j <= c2; j++) visit(i, j, wb.getValue(sheet, i, j));
    }
  }
  return count >= 2 ? { count, nums, sum } : null;
}

/** Alt satırdaki bilgi metni: aralıkta Toplam/Ortalama/Sayı, tek hücrede adres ve görünen değer. */
export function statusText(ctl: Controller): string {
  const s = ctl.edit ? null : selectionStats(ctl);
  const { row, col } = ctl.sel.active;
  if (s) {
    const fmt = ctl.wb.styleAt(ctl.sheet, row, col).numFmt;
    const show = (v: number) => formatValue(Number(v.toPrecision(15)), fmt && fmt !== "@" ? fmt : "General").text;
    const parts: string[] = [];
    if (s.nums > 0) parts.push(`Toplam: ${show(s.sum)}`, `Ortalama: ${show(s.sum / s.nums)}`);
    parts.push(`Sayı: ${s.count.toLocaleString("tr-TR")}`);
    return parts.join(" · ");
  }
  const text = displayText(ctl.wb, ctl.sheet, row, col);
  return text ? `${addr(row, col)}: ${text}` : addr(row, col);
}
