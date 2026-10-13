// Koyu temada ızgara üstündeki nesneler (yalnız ekranda, CSS ile; model ve dosya değişmez):
// açık nötr/pastel zeminli grafiklerin alanı koyu zemine, başlık/eksen/gösterge yazıları Koyu Sayfa
// mürekkep kuralıyla açık renge, kılavuz ve eksen çizgileri koyu tona çevrilir; seri renkleri ve
// tasarımlı (belirgin/koyu zeminli) grafikler aynen kalır. Dilimleyici ve özet tablo yer tutucusu
// aynı kurallarla koyulaşır; resimler değişmez. Kurallar Sunum'un grafik eşlemesiyle tutarlıdır.
import { themeOf } from "@tablo/charts/ChartView";
import type { ChartDef } from "@tablo/model/types";
import { darkGround, ink, lightNeutral, lightness, parseColor } from "./darkCanvas";

/** ChartView'un eksen çizgisi rengi. */
const AXIS = "#BFBFBF";

const attr = (v: string) => v.replace(/["\\]/g, "");

/** Grafik zemini koyu eşlenir mi (açık nötr/pastel ya da çözülemeyen/saydam)? */
export function chartMapped(def: ChartDef): boolean {
  const bg = def.fill ?? themeOf(def).bg;
  return !parseColor(bg) || lightNeutral(bg);
}

/** Koyu tema nesne kuralları; scope nesne katmanının seçicisi. */
export function objectsDarkCss(charts: ChartDef[], scope: string): string {
  const rules: string[] = [];
  const groups = new Map<string, { inks: Set<string>; lines: Set<string>; borders: Set<string> }>();
  for (const d of charts) {
    if (!chartMapped(d)) continue;
    const t = themeOf(d);
    const bg = d.fill ?? t.bg;
    const g = groups.get(bg) ?? { inks: new Set<string>(), lines: new Set<string>([AXIS]), borders: new Set<string>() };
    g.inks.add(t.ink);
    g.lines.add(t.grid);
    const b = d.border === "none" ? undefined : (d.border ?? t.border);
    if (b) g.borders.add(b);
    groups.set(bg, g);
  }
  for (const [bg, g] of groups) {
    const ground = parseColor(bg) ? darkGround(bg) : darkGround("#FFFFFF");
    const c = `${scope} .tb-float.is-chart:has(rect[data-el="area"][fill="${attr(bg)}" i])`;
    rules.push(`${c}{background:${ground};border-color:${darkGround("#D9D9D9")}}`);
    rules.push(`${c} rect[data-el="area"]{fill:${ground}}`);
    for (const k of g.inks) if ((lightness(k) ?? 1) < 0.5) rules.push(`${c} :is(text,g)[fill="${attr(k)}" i]{fill:${ink(k)}}`);
    for (const l of g.lines) if (lightNeutral(l)) rules.push(`${c} line[stroke="${attr(l)}" i]{stroke:${darkGround(l)}}`);
    // Pasta dilimi ayraçları zemin, nokta işaretçilerinin çerçevesi beyaz renktedir
    rules.push(`${c} path.tb-chart-mark[stroke="${attr(bg)}" i],${c} circle.tb-chart-mark[stroke="#FFFFFF" i]{stroke:${ground}}`);
    for (const b of g.borders) if (lightNeutral(b)) rules.push(`${c} rect[data-el="area"][stroke="${attr(b)}" i]{stroke:${darkGround(b)}}`);
  }
  // Dilimleyici (masaüstü objects.css renklerinin koyu karşılığı)
  const s = `${scope} .tb-slicer`;
  rules.push(`${s}{background:${darkGround("#FFFFFF")};border-color:${darkGround("#C8C8C8")};color:${ink("#262626")};box-shadow:0 1px 3px rgba(0,0,0,.5)}`);
  rules.push(`${s}-head{border-bottom-color:${darkGround("#E1E1E1")}}`);
  rules.push(`${s}-btn.is-on{background:${darkGround("#E1DFDD")}}`);
  rules.push(`${s}-item{background:${darkGround("#FFFFFF")};border-color:${darkGround("#D9D9D9")};color:${ink("#262626")}}`);
  rules.push(`${s}-item.is-selected{background:${darkGround("#DCE6F1")};border-color:${darkGround("#9CB6D3")}}`);
  // Alan seçilmemiş özet tablonun yer tutucusu
  rules.push(`${scope} .tb-pv-placeholder{background:${darkGround("rgba(221,235,247,0.55)")};border-color:${darkGround("#9BC2E6")};color:${ink("#3B3B3B")}}`);
  return rules.join("\n");
}
