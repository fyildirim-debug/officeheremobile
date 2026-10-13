// Koyu ızgara: masaüstü çizicisi (render.ts) olduğu gibi çalışır, tuval bağlamı bir vekil
// üzerinden verilir. Vekil hücre alanındaki renkleri Koyu Sayfa kuralıyla (Belge/Sunum ile aynı)
// çevirir: zemin #1f1f1f, kılavuz çizgileri koyu; açık nötr/pastel dolgular aynı renk tonunda
// koyulaşır, belirgin (doygun ya da koyu) dolgular kâğıttaki gibi kalır. Koyulaşan ya da dolgusuz
// zemindeki koyu metin ve çizgiler aynı tonda açılır (OKLCH açıklığı 0,5'ten küçükse 0,92 − 0,55·L);
// kâğıttaki gibi kalan dolgunun metni özgün rengini korur. Başlıklar render.ts'nin koyu paletiyle
// çizilir. Yalnız ekran: model ve kaydedilen dosya değişmez.

export const DARK_BG = "#1f1f1f";
export const DARK_GRID = "#3c3c3c";
/** render.ts'deki açık tema kılavuz rengi ve seçim dolgusu. */
const LIGHT_GRID = "#d4d4d4";
const LIGHT_SEL = "rgba(20,110,60,0.12)";
const DARK_SEL = "rgba(60,190,115,0.24)";

type Rgba = [number, number, number, number];

const parsed = new Map<string, Rgba | null>();

/** "#rgb", "#rrggbb", "#rrggbbaa", "rgb()/rgba()" ve birkaç adlı renk. */
export function parseColor(c: string): Rgba | null {
  const hit = parsed.get(c);
  if (hit !== undefined) return hit;
  let out: Rgba | null = null;
  const s = c.trim().toLowerCase();
  if (s.startsWith("#")) {
    const h = s.slice(1);
    if (/^[0-9a-f]{3,4}$/.test(h)) {
      const v = h.split("").map((x) => parseInt(x + x, 16));
      out = [v[0], v[1], v[2], h.length === 4 ? v[3] / 255 : 1];
    } else if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) {
      out = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
    }
  } else {
    const m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (p.length >= 3 && p.slice(0, 3).every((n) => Number.isFinite(n))) out = [p[0], p[1], p[2], p.length > 3 && Number.isFinite(p[3]) ? p[3] : 1];
    } else if (s === "white") out = [255, 255, 255, 1];
    else if (s === "black") out = [0, 0, 0, 1];
  }
  if (parsed.size > 4000) parsed.clear();
  parsed.set(c, out);
  return out;
}

export function isWhite(c: string): boolean {
  const p = parseColor(c);
  return !!p && p[0] >= 250 && p[1] >= 250 && p[2] >= 250 && p[3] > 0.98;
}

const toLin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const toSrgb = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

/** sRGB → OKLab [L, a, b]. */
export function toOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = toLin(r);
  const lg = toLin(g);
  const lb = toLin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

export function fromOklab(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}

/** Rengin OKLab açıklığı (0..1); çözülemeyen renkte null. */
export function lightness(c: string): number | null {
  const p = parseColor(c);
  return p ? toOklab(p[0], p[1], p[2])[0] : null;
}

const inked = new Map<string, string>();

/** Koyu zeminde okunur renk: açıklığı 0,5'ten küçük renk aynı tonda 0,92 − 0,55·L açıklığına çıkar. */
export function ink(c: string): string {
  const hit = inked.get(c);
  if (hit) return hit;
  const p = parseColor(c);
  let out = c;
  if (p) {
    const [L, a, b] = toOklab(p[0], p[1], p[2]);
    if (L < 0.5) {
      const [r, g, bb] = fromOklab(0.92 - 0.55 * L, a, b);
      out = p[3] < 1 ? `rgba(${r},${g},${bb},${p[3]})` : `rgb(${r},${g},${bb})`;
    }
  }
  if (inked.size > 4000) inked.clear();
  inked.set(c, out);
  return out;
}

const grounds = new Map<string, string>();

/** Açık ton mu: açık nötr/gri ya da pastel (Sunum koyu kuralıyla aynı ölçüt; belirgin renk değil). */
export function lightNeutral(c: string): boolean {
  const p = parseColor(c);
  if (!p) return false;
  const [L, a, b] = toOklab(p[0], p[1], p[2]);
  const C = Math.hypot(a, b);
  return (L >= 0.6 && C <= 0.1) || (L >= 0.8 && C <= 0.16);
}

/** Zemin rengi: açık nötr/pastel ton aynı renk tonunda koyulaşır (beyaz → #1E1E1E), belirgin renk aynen kalır. */
export function darkGround(c: string): string {
  const hit = grounds.get(c);
  if (hit) return hit;
  const p = parseColor(c);
  let out = c;
  if (p && lightNeutral(c)) {
    const [L, a, b] = toOklab(p[0], p[1], p[2]);
    const [r, g, bb] = fromOklab(0.6 - 0.9125 * (L - 0.6), a, b);
    out = p[3] < 1 ? `rgba(${r},${g},${bb},${p[3]})` : `#${[r, g, bb].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  if (grounds.size > 4000) grounds.clear();
  grounds.set(c, out);
  return out;
}

const isDark = (c: string) => {
  const l = lightness(c);
  return l !== null && l < 0.5;
};

/** Vekilin hücre alanını tanıması için gereken bilgiler (CSS pikseli). */
export interface DarkProbe {
  /** Başlık (ve anahat) bölgesinin genişliği/yüksekliği. */
  headerW: number;
  headerH: number;
  /** Ekran noktası dolgulu (kâğıt görünümlü) bir hücrede mi? */
  paper(x: number, y: number): boolean;
  /** Bu kalınlığa kadar dikdörtgenler çizgi sayılır (kenarlık, alt çizgi). */
  thin: number;
}

interface PenState {
  fill: unknown;
  stroke: unknown;
  tx: number;
  ty: number;
}

type Ctx = CanvasRenderingContext2D;

/**
 * Koyu çizim için tuval bağlamı vekili. Yalnız renk atamalarını ve çizim çağrılarını yakalar;
 * diğer her şey gerçek bağlama aynen iletilir.
 */
export function darkContext(ctx: Ctx, probe: DarkProbe): Ctx {
  let pen: PenState = { fill: "#000000", stroke: "#000000", tx: 0, ty: 0 };
  const stack: PenState[] = [];
  let appliedFill: unknown = undefined;
  let appliedStroke: unknown = undefined;
  // Yol sınır kutusu (beginPath ile sıfırlanır)
  let bx1 = Infinity;
  let by1 = Infinity;
  let bx2 = -Infinity;
  let by2 = -Infinity;
  const addPt = (x: number, y: number, r = 0) => {
    const ax = x + pen.tx;
    const ay = y + pen.ty;
    if (ax - r < bx1) bx1 = ax - r;
    if (ay - r < by1) by1 = ay - r;
    if (ax + r > bx2) bx2 = ax + r;
    if (ay + r > by2) by2 = ay + r;
  };
  const header = (x2: number, y2: number) => x2 <= probe.headerW + 0.5 || y2 <= probe.headerH + 0.5;
  const setFill = (v: unknown) => {
    if (v !== appliedFill) {
      ctx.fillStyle = v as string;
      appliedFill = v;
    }
  };
  const setStroke = (v: unknown) => {
    if (v !== appliedStroke) {
      ctx.strokeStyle = v as string;
      appliedStroke = v;
    }
  };

  /** Dolgu dikdörtgeninin rengi. */
  const rectColor = (c: unknown, x: number, y: number, w: number, h: number): unknown => {
    if (typeof c !== "string") return c;
    const ax = Math.min(x, x + w) + pen.tx;
    const ay = Math.min(y, y + h) + pen.ty;
    const aw = Math.abs(w);
    const ah = Math.abs(h);
    if (header(ax + aw, ay + ah)) return c;
    if (isWhite(c)) return DARK_BG;
    const key = c.replace(/\s+/g, "").toLowerCase();
    if (key === LIGHT_GRID) return DARK_GRID;
    if (key === LIGHT_SEL) return DARK_SEL;
    const thin = Math.min(aw, ah) <= probe.thin;
    if (thin && isDark(c)) {
      // Çizgi (kenarlık, alt çizgi): iki yanı da kâğıttaki gibi kalan dolguysa özgün renk
      const horiz = aw >= ah;
      const p1 = horiz ? probe.paper(ax + aw / 2, ay - 1.5) : probe.paper(ax - 1.5, ay + ah / 2);
      const p2 = horiz ? probe.paper(ax + aw / 2, ay + ah + 1.5) : probe.paper(ax + aw + 1.5, ay + ah / 2);
      return p1 && p2 ? c : ink(c);
    }
    // Hücre dolgusu: açık nötr/pastel ton koyulaşır, belirgin renk aynen
    return thin ? c : darkGround(c);
  };

  /** Yol (üçgen, simge, mini grafik) rengi: dolgusuz alanda koyu renkler açılır. */
  const pathColor = (c: unknown): unknown => {
    if (typeof c !== "string" || bx2 < bx1) return c;
    if (header(bx2, by2)) return c;
    if (!isDark(c)) return c;
    return probe.paper((bx1 + bx2) / 2, (by1 + by2) / 2) ? c : ink(c);
  };

  const fns: Record<string, unknown> = {
    save() {
      stack.push({ ...pen });
      ctx.save();
    },
    restore() {
      pen = stack.pop() ?? pen;
      ctx.restore();
      // Gerçek bağlamın renkleri de geri döndü
      appliedFill = undefined;
      appliedStroke = undefined;
    },
    setTransform(...a: unknown[]) {
      pen.tx = 0;
      pen.ty = 0;
      (ctx.setTransform as (...x: unknown[]) => void)(...a);
    },
    resetTransform() {
      pen.tx = 0;
      pen.ty = 0;
      ctx.resetTransform();
    },
    translate(x: number, y: number) {
      pen.tx += x;
      pen.ty += y;
      ctx.translate(x, y);
    },
    beginPath() {
      bx1 = by1 = Infinity;
      bx2 = by2 = -Infinity;
      ctx.beginPath();
    },
    moveTo(x: number, y: number) {
      addPt(x, y);
      ctx.moveTo(x, y);
    },
    lineTo(x: number, y: number) {
      addPt(x, y);
      ctx.lineTo(x, y);
    },
    rect(x: number, y: number, w: number, h: number) {
      addPt(x, y);
      addPt(x + w, y + h);
      ctx.rect(x, y, w, h);
    },
    arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean) {
      addPt(x, y, r);
      ctx.arc(x, y, r, a0, a1, ccw);
    },
    ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw?: boolean) {
      addPt(x, y, Math.max(rx, ry));
      ctx.ellipse(x, y, rx, ry, rot, a0, a1, ccw);
    },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
      addPt(cx, cy);
      addPt(x, y);
      ctx.quadraticCurveTo(cx, cy, x, y);
    },
    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
      addPt(c1x, c1y);
      addPt(c2x, c2y);
      addPt(x, y);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
    },
    fillRect(x: number, y: number, w: number, h: number) {
      setFill(rectColor(pen.fill, x, y, w, h));
      ctx.fillRect(x, y, w, h);
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      bx1 = Math.min(x, x + w) + pen.tx;
      by1 = Math.min(y, y + h) + pen.ty;
      bx2 = Math.max(x, x + w) + pen.tx;
      by2 = Math.max(y, y + h) + pen.ty;
      setStroke(pathColor(pen.stroke));
      ctx.strokeRect(x, y, w, h);
    },
    fill(...a: unknown[]) {
      setFill(pathColor(pen.fill));
      (ctx.fill as (...x: unknown[]) => void)(...a);
    },
    stroke(...a: unknown[]) {
      setStroke(pathColor(pen.stroke));
      (ctx.stroke as (...x: unknown[]) => void)(...a);
    },
    fillText(text: string, x: number, y: number, maxWidth?: number) {
      const c = pen.fill;
      let out = c;
      if (typeof c === "string") {
        const ax = x + pen.tx;
        const ay = y + pen.ty;
        if (!(ax <= probe.headerW || ay <= probe.headerH) && isDark(c) && !probe.paper(ax + 2, ay - 3)) out = ink(c);
      }
      setFill(out);
      if (maxWidth === undefined) ctx.fillText(text, x, y);
      else ctx.fillText(text, x, y, maxWidth);
    },
    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      const add = g.addColorStop.bind(g);
      // Veri çubuğu beyaza değil koyu zemine söner
      g.addColorStop = (o: number, c: string) => add(o, isWhite(c) ? DARK_BG : c);
      return g;
    },
  };

  const bound = new Map<PropertyKey, unknown>();
  return new Proxy(ctx, {
    get(target, prop) {
      if (prop === "fillStyle") return pen.fill;
      if (prop === "strokeStyle") return pen.stroke;
      if (typeof prop === "string" && Object.prototype.hasOwnProperty.call(fns, prop)) return fns[prop];
      const v = (target as unknown as Record<PropertyKey, unknown>)[prop];
      if (typeof v !== "function") return v;
      let b = bound.get(prop);
      if (!b) bound.set(prop, (b = (v as (...x: unknown[]) => unknown).bind(target)));
      return b;
    },
    set(target, prop, value) {
      if (prop === "fillStyle") pen.fill = value;
      else if (prop === "strokeStyle") pen.stroke = value;
      else (target as unknown as Record<PropertyKey, unknown>)[prop] = value;
      return true;
    },
  });
}
