/**
 * Koyu tema: açık (beyaz ya da çok açık) zeminli slaytlar ekranda koyu çizilir.
 *
 * Eşleme çizim düzeyindedir: masaüstü SlideView aynen kullanılır, yalnız ona
 * verilen sunu kopyasının renkleri dönüştürülür (kaydedilen sunu, gösteri ve
 * dışa aktarma etkilenmez). Kurallar Belge'nin "Koyu Sayfa"sıyla aynıdır:
 * - Zemin (slayt arka planı, şekil/hücre dolgusu): açık nötr tonlar koyulaşır,
 *   belirgin (doygun ya da koyu) dolgular aynen kalır.
 * - Mürekkep (metin, çizgi, kenarlık, madde işareti): açıklığı 0,5'ten küçükse
 *   aynı renk tonunda 0,92 − 0,55·L'ye çıkar (siyah → #e4e4e4); diğerleri kalır.
 * - Dolgusu korunan şeklin metni özgün rengini korur (sarı kutuda siyah yazı).
 * - Resim, video ve grafik serileri değişmez; grafiğin yazı ve kılavuz
 *   çizgileri aynı kurallarla CSS'te eşlenir.
 * Koyu zeminli (tasarımlı) slaytlar olduğu gibi kalır.
 */
import { cssColor, resolveHex } from "@sunum/model/color";
import { chartStyle } from "@sunum/model/chart";
import { effectivePara, effectiveRun, levelResolver, type TextContext } from "@sunum/model/textStyle";
import { cellFormat } from "@sunum/render/tableStyles";
import type { BulletDef, CellBorder, ChartShape, Color, Fill, LevelStyle, Layout, Line, Master, Paragraph, Presentation, RunProps, Shape, Slide, SpShape, TableShape, TextBody, TextStyles, Theme } from "@sunum/model/types";

/* ----------------------------- Renk uzayı ----------------------------- */

const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function hexRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  h = h.padEnd(6, "0").slice(0, 6);
  return [parseInt(h.slice(0, 2), 16) / 255 || 0, parseInt(h.slice(2, 4), 16) / 255 || 0, parseInt(h.slice(4, 6), 16) / 255 || 0];
}

/** "#RRGGBB" → OKLCH [L 0..1, C, h derece]. */
export function oklch(hex: string): [number, number, number] {
  const [r, g, b] = hexRgb(hex).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const h = C < 1e-6 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return [L, C, h];
}

function oklchToLinear(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH → "#RRGGBB"; renk alanı dışındaysa ton ve açıklık korunarak doygunluk azaltılır. */
export function oklchHex(L: number, C: number, h: number): string {
  L = Math.max(0, Math.min(1, L));
  let rgb = oklchToLinear(L, C, h);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear(L, mid, h))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinear(L, lo, h);
  }
  return `#${rgb
    .map((v) => Math.round(Math.max(0, Math.min(1, toSrgb(Math.max(0, v)))) * 255).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

/** Açık ton: açık nötr/gri ya da pastel (doygun, belirgin renk değil). */
function acikTon(L: number, C: number): boolean {
  return (L >= 0.6 && C <= 0.1) || (L >= 0.8 && C <= 0.16);
}

/** Zemin rengi: açık nötr ya da pastel ton koyulaşır (beyaz → #1E1E1E), belirgin renk aynen kalır. */
export function koyuZemin(hex: string): string {
  const [L, C, h] = oklch(hex);
  if (!acikTon(L, C)) return hex.toUpperCase();
  return oklchHex(0.6 - 0.9125 * (L - 0.6), C, h);
}

/** Mürekkep rengi (metin, çizgi): koyu ton aynı renk tonunda açılır (siyah → #E4E4E4). */
export function koyuMurekkep(hex: string): string {
  const [L, C, h] = oklch(hex);
  if (L >= 0.5) return hex.toUpperCase();
  return oklchHex(0.92 - 0.55 * L, C, h);
}

/** Zemin rengi koyu eşlemede değişir mi (açık nötr mü)? */
export function acikNotr(hex: string): boolean {
  const [L, C] = oklch(hex);
  return acikTon(L, C);
}

/** Slayt zemini "beyaz ya da çok açık" mı (koyu çizilecek mi)? */
export function acikSlaytZemini(fill: Fill | undefined, theme: Theme): boolean {
  const cokAcik = (c: Color) => {
    const [L, C] = oklch(resolveHex(c, theme));
    return L >= 0.8 && acikTon(L, C);
  };
  if (!fill || fill.type === "none") return true;
  if (fill.type === "solid") return cokAcik(fill.color);
  if (fill.type === "gradient") return fill.stops.length > 0 && fill.stops.every((s) => cokAcik(s.color));
  return false;
}

/* ----------------------------- Model eşlemesi ----------------------------- */

type Eslem = (hex: string) => string;

function renk(c: Color | undefined, theme: Theme, f: Eslem): Color | undefined {
  if (!c) return c;
  const hex = resolveHex(c, theme);
  const out: Color = { rgb: f(hex) };
  if (c.alpha !== undefined) out.alpha = c.alpha;
  return out;
}

/** Dolgu eşlemesi; `kept` dolgu korunduysa (belirgin renk, resim, karışık geçiş) true. */
function dolgu(fill: Fill, theme: Theme): { fill: Fill; kept: boolean } {
  if (fill.type === "solid") {
    if (!acikNotr(resolveHex(fill.color, theme))) return { fill, kept: true };
    return { fill: { type: "solid", color: renk(fill.color, theme, koyuZemin)! }, kept: false };
  }
  if (fill.type === "gradient") {
    if (!fill.stops.every((s) => acikNotr(resolveHex(s.color, theme)))) return { fill, kept: true };
    return { fill: { ...fill, stops: fill.stops.map((s) => ({ ...s, color: renk(s.color, theme, koyuZemin)! })) }, kept: false };
  }
  return { fill, kept: fill.type === "image" };
}

function cizgi(line: Line, theme: Theme): Line {
  if (line.fill.type !== "solid") return line;
  return { ...line, fill: { type: "solid", color: renk(line.fill.color, theme, koyuMurekkep)! } };
}

function madde(b: BulletDef | undefined, theme: Theme): BulletDef | undefined {
  if (!b || b.type === "none" || !b.color) return b;
  return { ...b, color: renk(b.color, theme, koyuMurekkep) };
}

/** Paragraf özelliklerinde madde rengini eşler; madde tanımı yoksa nesne aynen kalır (tanımsız anahtar eklenmez). */
function paraMadde<T extends { bullet?: BulletDef }>(p: T, theme: Theme): T {
  return p.bullet ? { ...p, bullet: madde(p.bullet, theme) } : p;
}

function calisma(p: RunProps, theme: Theme): RunProps {
  const out: RunProps = { ...p };
  if (p.color) out.color = renk(p.color, theme, koyuMurekkep);
  if (p.outline) out.outline = renk(p.outline, theme, koyuMurekkep);
  if (p.highlight) out.highlight = renk(p.highlight, theme, koyuZemin);
  return out;
}

function duzeyler(levels: Partial<LevelStyle>[] | undefined, theme: Theme): Partial<LevelStyle>[] | undefined {
  if (!levels) return levels;
  return levels.map((l) => (l ? { ...l, run: l.run ? calisma(l.run, theme) : l.run, para: l.para ? paraMadde(l.para, theme) : l.para } : l));
}

function metinStilleri(ts: TextStyles, theme: Theme): TextStyles {
  const m = (list: LevelStyle[]) => list.map((l) => ({ para: paraMadde(l.para, theme), run: calisma(l.run, theme) }));
  return { title: m(ts.title), body: m(ts.body), other: m(ts.other) };
}

/** Eşlenen bağlamdaki metin: açık çalıştırma renkleri ve düzey stilleri eşlenir. */
function metinEsle(body: TextBody, theme: Theme, lvl: (n: number) => LevelStyle): TextBody {
  return {
    ...body,
    levels: duzeyler(body.levels, theme),
    paragraphs: body.paragraphs.map((p) => {
      const runs = p.runs.map((r) => {
        const props = calisma(r.props, theme);
        // Korunan vurgu renginin üstündeki yazı özgün rengini korur.
        if (r.props.highlight && !acikNotr(resolveHex(r.props.highlight, theme))) props.color = effectiveRun(r.props, p, lvl).color;
        return { ...r, props };
      });
      return { ...p, runs, endProps: p.endProps ? calisma(p.endProps, theme) : p.endProps, props: paraMadde(p.props, theme) };
    }),
  };
}

/** Korunan bağlamdaki metin: kalıtımla gelen renkler özgün değerleriyle açıkça yazılır. */
function metinKoru(body: TextBody, lvl: (n: number) => LevelStyle): TextBody {
  return {
    ...body,
    paragraphs: body.paragraphs.map((p) => {
      const bullet = effectivePara(p, lvl).bullet;
      return {
        ...p,
        runs: p.runs.map((r) => ({ ...r, props: { ...r.props, color: effectiveRun(r.props, p, lvl).color } })),
        endProps: { ...(p.endProps ?? {}), color: effectiveRun(p.endProps ?? {}, p, lvl).color },
        props: bullet && bullet.type !== "none" && bullet.color ? { ...p.props, bullet } : p.props,
      } satisfies Paragraph;
    }),
  };
}

/** Eşlenen bağlamda kalıtımla gelen renkleri eşlenmiş olarak açıkça yazar (tablo hücreleri). */
function metinCoz(body: TextBody, lvl: (n: number) => LevelStyle, theme: Theme, eslenir: boolean): TextBody {
  const f = (c: Color | undefined) => (eslenir ? renk(c, theme, koyuMurekkep) : c);
  return {
    ...body,
    paragraphs: body.paragraphs.map((p) => {
      const bullet = effectivePara(p, lvl).bullet;
      return {
        ...p,
        runs: p.runs.map((r) => {
          const eff = effectiveRun(r.props, p, lvl);
          const hlKept = !!r.props.highlight && !acikNotr(resolveHex(r.props.highlight, theme));
          const props: RunProps = { ...r.props, color: hlKept ? eff.color : f(eff.color) };
          if (eslenir && r.props.highlight) props.highlight = renk(r.props.highlight, theme, koyuZemin);
          if (eslenir && r.props.outline) props.outline = renk(r.props.outline, theme, koyuMurekkep);
          return { ...r, props };
        }),
        endProps: { ...(p.endProps ?? {}), color: f(effectiveRun(p.endProps ?? {}, p, lvl).color) },
        props: bullet && bullet.type !== "none" && bullet.color ? { ...p.props, bullet: { ...bullet, color: f(bullet.color) } } : p.props,
      } satisfies Paragraph;
    }),
  };
}

interface SekilBilgi {
  /** Metni eşlenen (koyu bağlamdaki) üst düzey şekiller: düzenleyici CSS ile eşlenir. */
  ink: Set<string>;
  /** Yazı/kılavuz renkleri CSS ile eşlenecek üst düzey grafikler. */
  chart: Set<string>;
}

function tablo(t: TableShape, theme: Theme, tctx: TextContext): TableShape {
  const base = levelResolver({ kind: "sp" }, tctx, "other");
  const kenar = (b: CellBorder | null): CellBorder | null => (b ? { ...b, color: renk(b.color, theme, koyuMurekkep)! } : null);
  return {
    ...t,
    rows: t.rows.map((row, r) => ({
      ...row,
      cells: row.cells.map((cell, c) => {
        if (cell.hMerge || cell.vMerge) return cell;
        const fmt = cellFormat(t, r, c);
        const d = fmt.fill.type === "none" ? { fill: fmt.fill, kept: false } : dolgu(fmt.fill, theme);
        const lvl = (n: number): LevelStyle => {
          const b = base(n);
          return { para: b.para, run: { ...b.run, color: fmt.text ?? b.run.color, bold: fmt.bold || b.run.bold } };
        };
        return {
          ...cell,
          fill: d.fill,
          borders: { t: kenar(fmt.borders.t), b: kenar(fmt.borders.b), l: kenar(fmt.borders.l), r: kenar(fmt.borders.r) },
          text: metinCoz(cell.text, lvl, theme, !d.kept),
        };
      }),
    })),
  };
}

function grafikEslenir(s: ChartShape, theme: Theme): boolean {
  if (chartStyle(s.chart).bg === "dark") return false;
  return !s.chart.fill || acikNotr(resolveHex(s.chart.fill, theme));
}

function sekil(s: Shape, theme: Theme, tctx: TextContext, info?: SekilBilgi): Shape {
  switch (s.kind) {
    case "sp": {
      const d = dolgu(s.fill, theme);
      // Dolgusu korunan şeklin anahattı da tasarımın parçasıdır, aynen kalır.
      const out: SpShape = { ...s, fill: d.fill, line: d.kept ? s.line : cizgi(s.line, theme) };
      if (s.text) {
        const lvl = levelResolver(s, tctx);
        out.text = d.kept ? metinKoru(s.text, lvl) : metinEsle(s.text, theme, lvl);
        if (!d.kept) info?.ink.add(s.id);
      }
      return out;
    }
    case "pic":
      return { ...s, line: cizgi(s.line, theme) };
    case "table":
      return tablo(s, theme, tctx);
    case "group":
      return { ...s, children: s.children.map((c) => sekil(c, theme, tctx)) };
    case "chart": {
      if (!grafikEslenir(s, theme)) return s;
      info?.chart.add(s.id);
      if (!s.chart.fill && !s.chart.line) return s;
      return { ...s, chart: { ...s.chart, fill: renk(s.chart.fill, theme, koyuZemin), line: renk(s.chart.line, theme, koyuMurekkep) } };
    }
  }
}

/* ----------------------------- Önbellekli sunu kopyası ----------------------------- */

const temaOnb = new WeakMap<Theme, Theme>();
const asilOnb = new WeakMap<Master, { theme: Theme; out: Master }>();
const duzenOnb = new WeakMap<Layout, { master: Master; theme: Theme; out: Layout }>();
const duzenlerOnb = new WeakMap<Layout[], { master: Master; theme: Theme; out: Layout[] }>();
const slaytOnb = new WeakMap<Slide, { master: Master; layout?: Layout; theme: Theme; out: Slide; info: SekilBilgi }>();

/** Köprü renkleri koyu zeminde okunur olsun; diğer tema renkleri aynen (grafik/tablo stilleri özgün çözülür). */
function koyuTema(t: Theme): Theme {
  let out = temaOnb.get(t);
  if (!out) {
    out = { ...t, colors: { ...t.colors, hlink: koyuMurekkep(t.colors.hlink), folHlink: koyuMurekkep(t.colors.folHlink) } };
    temaOnb.set(t, out);
  }
  return out;
}

function bgEsle(fill: Fill | undefined, theme: Theme): Fill | undefined {
  if (!fill) return fill;
  if (fill.type === "none") return { type: "solid", color: { rgb: koyuZemin("#FFFFFF") } };
  return dolgu(fill, theme).fill;
}

function koyuAsil(m: Master, theme: Theme): Master {
  const hit = asilOnb.get(m);
  if (hit && hit.theme === theme) return hit.out;
  const tctx: TextContext = { master: m };
  const out: Master = {
    ...m,
    background: bgEsle(m.background, theme)!,
    textStyles: metinStilleri(m.textStyles, theme),
    shapes: m.shapes.map((s) => (s.kind === "sp" && s.ph ? { ...s, text: s.text ? { ...s.text, levels: duzeyler(s.text.levels, theme) } : s.text } : sekil(s, theme, tctx))),
  };
  asilOnb.set(m, { theme, out });
  return out;
}

function koyuDuzen(l: Layout, m: Master, theme: Theme): Layout {
  const hit = duzenOnb.get(l);
  if (hit && hit.master === m && hit.theme === theme) return hit.out;
  const lt = l.theme ?? theme;
  const tctx: TextContext = { master: m, layout: l };
  const out: Layout = {
    ...l,
    theme: l.theme ? koyuTema(l.theme) : undefined,
    background: bgEsle(l.background, lt),
    shapes: l.shapes.map((s) => (s.kind === "sp" && s.ph ? { ...s, text: s.text ? { ...s.text, levels: duzeyler(s.text.levels, lt) } : s.text } : sekil(s, lt, tctx))),
  };
  duzenOnb.set(l, { master: m, theme, out });
  return out;
}

function koyuSlayt(sl: Slide, pres: Presentation): { out: Slide; info: SekilBilgi } {
  const layout = pres.layouts.find((l) => l.id === sl.layoutId) ?? pres.layouts[0];
  const hit = slaytOnb.get(sl);
  if (hit && hit.master === pres.master && hit.layout === layout && hit.theme === pres.theme) return hit;
  const theme = layout?.theme ?? pres.theme;
  const tctx: TextContext = { master: pres.master, layout };
  const info: SekilBilgi = { ink: new Set(), chart: new Set() };
  const out: Slide = { ...sl, background: sl.background ? bgEsle(sl.background, theme) : undefined, shapes: sl.shapes.map((s) => sekil(s, theme, tctx, info)) };
  const res = { master: pres.master, layout, theme: pres.theme, out, info };
  slaytOnb.set(sl, res);
  return res;
}

const opak = (c: Color) => c.alpha === undefined || c.alpha >= 0.85;

/* ----------------------------- Resim zeminler ----------------------------- */

const resimler = new Map<string, boolean | null>();
const resimDinleyiciler = new Set<() => void>();

/** Resim çoğunlukla açık (beyaz/çok açık) mı? İlk soruda ölçüm başlar (undefined), bitince dinleyiciler uyarılır. */
export function resimAcikMi(src: string): boolean | undefined {
  const r = resimler.get(src);
  if (r !== undefined) return r ?? undefined;
  if (typeof Image === "undefined" || typeof document === "undefined" || !src) return undefined;
  resimler.set(src, null);
  const bitti = (v: boolean) => {
    resimler.set(src, v);
    resimDinleyiciler.forEach((f) => f());
  };
  const img = new Image();
  img.onload = () => {
    try {
      const n = 24;
      const c = document.createElement("canvas");
      c.width = n;
      c.height = n;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, n, n);
      const d = ctx.getImageData(0, 0, n, n).data;
      let acik = 0;
      for (let i = 0; i < d.length; i += 4) {
        // Saydam piksel alttaki (beyaz) zemini gösterir.
        if (d[i + 3] < 26) {
          acik++;
          continue;
        }
        const hex = `#${[d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
        const [L, C] = oklch(hex);
        if (L >= 0.8 && acikTon(L, C)) acik++;
      }
      bitti(acik / (n * n) >= 0.75);
    } catch {
      bitti(false);
    }
  };
  img.onerror = () => bitti(false);
  img.src = src;
  return undefined;
}

/** Resim ölçümleri bitince (koyu görünüm yeniden hesaplansın diye) çağrılır. */
export function resimDinle(fn: () => void): () => void {
  resimDinleyiciler.add(fn);
  return () => void resimDinleyiciler.delete(fn);
}

type Kaplama = Fill | { resim: string };

/** Şekil slaydın neredeyse tamamını kaplayan opak bir zemin mi (tasarımlarda tam sayfa dikdörtgen/resim)? */
function kaplayan(s: Shape, w: number, h: number): Kaplama | null {
  if (s.hidden || (s.rot && Math.abs(((s.rot % 180) + 180) % 180) > 1)) return null;
  const iw = Math.max(0, Math.min(s.x + s.w, w) - Math.max(s.x, 0));
  const ih = Math.max(0, Math.min(s.y + s.h, h) - Math.max(s.y, 0));
  if (iw * ih < w * h * 0.85) return null;
  if (s.kind === "pic") return s.media ? null : { resim: s.src };
  if (s.kind !== "sp" || (s.geom !== "rect" && s.geom !== "roundRect")) return null;
  const f = s.fill;
  if (f.type === "solid") return opak(f.color) ? f : null;
  if (f.type === "gradient") return f.stops.every((x) => opak(x.color)) ? f : null;
  if (f.type === "image") return { resim: f.src };
  return null;
}

/** Görünen zemin: arka plan, üstünde slaydı kaplayan en üstteki asıl/düzen/slayt şekli (resimse yeri). */
type Zemin = { fill: Fill } | { resim: string; yer: "zemin" | "deco" | { sekil: string } };

function gorunenZemin(pres: Presentation, layout: Layout | undefined, shapes: Shape[], background: Fill | undefined, hideMaster?: boolean): Zemin {
  const bg = background ?? layout?.background ?? pres.master.background;
  let z: Zemin = bg.type === "image" ? { resim: bg.src, yer: "zemin" } : { fill: bg };
  const deco = (list: Shape[]) => list.filter((s) => !(s.kind === "sp" && s.ph));
  const showMaster = !hideMaster && (layout?.showMasterShapes ?? true);
  const ust = [...(showMaster ? deco(pres.master.shapes) : []), ...(!hideMaster && layout ? deco(layout.shapes) : [])];
  for (const s of ust) {
    const k = kaplayan(s, pres.width, pres.height);
    if (k) z = "resim" in k ? { resim: k.resim, yer: "deco" } : { fill: k };
  }
  for (const s of shapes) {
    const k = kaplayan(s, pres.width, pres.height);
    if (k) z = "resim" in k ? { resim: k.resim, yer: { sekil: s.id } } : { fill: k };
  }
  return z;
}

interface ZeminKarar {
  acik: boolean;
  /** Açık resim zemin: ekranda (yalnız resim) ters çevrilerek koyulaşır. */
  resim?: "zemin" | { sekil: string };
}

function zeminKarari(z: Zemin, theme: Theme): ZeminKarar {
  if ("fill" in z) return { acik: acikSlaytZemini(z.fill, theme) };
  // Asıl/düzendeki tam sayfa resim tasarım öğesi sayılır; zemin ya da slayt resmi ölçülür.
  if (z.yer === "deco" || resimAcikMi(z.resim) !== true) return { acik: false };
  return { acik: true, resim: z.yer };
}

function slaytKarari(pres: Presentation, sl: Slide): ZeminKarar {
  const layout = pres.layouts.find((l) => l.id === sl.layoutId) ?? pres.layouts[0];
  return zeminKarari(gorunenZemin(pres, layout, sl.shapes, sl.background, sl.hideMasterShapes), layout?.theme ?? pres.theme);
}

/** Slaytın görünen zemini açık mı (koyu çizilecek mi)? Koyu tasarımlı ya da koyu resim zeminli slayt kalır. */
export function slaytAcikMi(pres: Presentation, sl: Slide): boolean {
  return slaytKarari(pres, sl).acik;
}

function duzenKarari(pres: Presentation, l: Layout): ZeminKarar {
  return zeminKarari(gorunenZemin(pres, l, [], undefined), l.theme ?? pres.theme);
}

export interface SlaytGorunumu {
  pres: Presentation;
  slide: Slide;
  /** Koyu eşlendi mi? */
  koyu: boolean;
  /** SlideView'e verilecek sınıf (eşlenen slaytta tema sınıfı). */
  className?: string;
  /** Üst düzey şekillere eklenen sınıflar (düzenleyici ve grafik eşlemesi). */
  shapeClass?: (s: Shape) => string | undefined;
}

export interface KoyuSunu {
  /** i. slaydın ekranda çizileceği sunu ve slayt. */
  slayt(i: number): SlaytGorunumu;
  /** Düzen önizlemesi için sunu (eşlenmiş) ve eşlenip eşlenmediği. */
  duzen(l: Layout): { pres: Presentation; koyu: boolean; className: string };
  /** Grafik yazı/kılavuz eşlemesi (tema başına üretilen CSS). */
  css: string;
}

const temaKimlik = new WeakMap<Theme, number>();
let temaSay = 0;
function temaNo(t: Theme): number {
  let n = temaKimlik.get(t);
  if (n === undefined) {
    n = ++temaSay;
    temaKimlik.set(t, n);
  }
  return n;
}

/** Grafik çiziminin temadan türettiği renklere (ChartSvg ile aynı formüller) eşleme kuralları. */
export function grafikCss(theme: Theme, scope: string): string {
  const c = (col: Color) => cssColor(col, theme);
  const sel = `${scope} .m-skc`;
  const rules: string[] = [];
  // Yazılar, eksen başlıkları ve veri belirtme çizgileri (çubuk içindeki beyaz etiketler değişmez).
  const text = c({ scheme: "dk1", lumMod: 0.65, lumOff: 0.35 });
  if (koyuMurekkep(text) !== text) rules.push(`${sel} [fill="${text}" i]{fill:${koyuMurekkep(text)}}`, `${sel} [stroke="${text}" i]{stroke:${koyuMurekkep(text)}}`);
  // Kılavuz/eksen çizgileri ve dilim/çubuk ayraçları koyu zemine karışır.
  for (const z of new Set([c({ scheme: "dk1", lumMod: 0.15, lumOff: 0.85 }), c({ scheme: "dk1", lumMod: 0.05, lumOff: 0.95 }), c({ scheme: "lt1" }), "#fff"])) {
    const hex = z.length === 4 ? `#${z[1]}${z[1]}${z[2]}${z[2]}${z[3]}${z[3]}` : z;
    if (acikNotr(hex)) rules.push(`${sel} [stroke="${z}" i]{stroke:${koyuZemin(hex)}}`);
  }
  // Açık grafik alanı ve veri etiketi kutuları.
  for (const z of new Set([c({ scheme: "lt1", lumMod: 0.95 }), c({ scheme: "lt1" })])) {
    if (acikNotr(z)) rules.push(`${sel} rect[fill="${z}" i]{fill:${koyuZemin(z)}}`);
  }
  return rules.join("\n");
}

/**
 * Sununun koyu ekran görünümü. Açık zeminli slaytlar eşlenmiş kopyadan,
 * diğerleri özgün sunudan çizilir. Eşleme slayt, düzen ve asıl slayt başına
 * önbelleklidir: değişmeyen slaytların kopyası (ve küçük resmi) yeniden üretilmez.
 */
export function koyuSunu(pres: Presentation): KoyuSunu {
  const theme = koyuTema(pres.theme);
  const master = koyuAsil(pres.master, pres.theme);
  let layouts = duzenlerOnb.get(pres.layouts);
  if (!layouts || layouts.master !== pres.master || layouts.theme !== pres.theme) {
    layouts = { master: pres.master, theme: pres.theme, out: pres.layouts.map((l) => koyuDuzen(l, pres.master, pres.theme)) };
    duzenlerOnb.set(pres.layouts, layouts);
  }
  const infos: ({ info: SekilBilgi; karar: ZeminKarar } | null)[] = [];
  const slides = pres.slides.map((sl) => {
    const karar = slaytKarari(pres, sl);
    if (!karar.acik) {
      infos.push(null);
      return sl;
    }
    const r = koyuSlayt(sl, pres);
    infos.push({ info: r.info, karar });
    return r.out;
  });
  const dark: Presentation = { ...pres, theme, master, layouts: layouts.out, slides };
  const temalar = [pres.theme, ...pres.layouts.map((l) => l.theme).filter((t): t is Theme => !!t)];
  const css = [...new Set(temalar)].map((t) => grafikCss(t, `.m-sk-t${temaNo(t)}`)).join("\n");
  return {
    css,
    slayt(i) {
      const k = infos[i];
      if (!k) return { pres, slide: pres.slides[i], koyu: false };
      const { info, karar } = k;
      const sl = pres.slides[i];
      const layout = pres.layouts.find((l) => l.id === sl.layoutId) ?? pres.layouts[0];
      const resimSekil = typeof karar.resim === "object" ? karar.resim.sekil : undefined;
      return {
        pres: dark,
        slide: slides[i],
        koyu: true,
        className: `m-sk m-sk-t${temaNo(layout?.theme ?? pres.theme)}${karar.resim === "zemin" ? " m-skz" : ""}`,
        shapeClass: (s) => (s.id === resimSekil ? "m-skr" : info.ink.has(s.id) ? "m-ski" : info.chart.has(s.id) ? "m-skc" : undefined),
      };
    },
    duzen(l) {
      const karar = duzenKarari(pres, l);
      return { pres: karar.acik ? dark : pres, koyu: karar.acik, className: `m-sk${karar.resim === "zemin" ? " m-skz" : ""}` };
    },
  };
}

/** Düzen önizleme slaydını (yer tutucu istemleri) koyu bağlama çevirir. */
export function koyuOnizleme(pres: Presentation, sl: Slide): Slide {
  return koyuSlayt(sl, pres).out;
}
