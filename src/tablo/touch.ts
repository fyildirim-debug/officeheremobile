// Dokunmatik ızgara yardımcıları (saf): dokunma noktasından hücre, kıstırma yakınlaştırması,
// eylemsizlikli kaydırma ve seçim tutamaçları.
import { GridLayout } from "@tablo/grid/layout";
import { MAX_COLS, MAX_ROWS } from "@tablo/model/rect";
import type { Rect } from "@tablo/model/types";

export type TouchArea = "cell" | "colHeader" | "rowHeader" | "corner" | "none";

export interface TouchHit {
  area: TouchArea;
  row: number;
  col: number;
}

/** Izgara içindeki (CSS pikseli) noktanın karşılığı: hücre, sütun/satır başlığı ya da köşe. */
export function cellAtPoint(L: GridLayout, x: number, y: number): TouchHit {
  if (x < 0 || y < 0 || x > L.width || y > L.height) return { area: "none", row: -1, col: -1 };
  if ((L.outlineW && x < L.outlineW) || (L.outlineH && y < L.outlineH)) return { area: "none", row: -1, col: -1 };
  if (x < L.headerW && y < L.headerH) return { area: "corner", row: -1, col: -1 };
  if (y < L.headerH) return { area: "colHeader", row: -1, col: L.colAtX(x) };
  if (x < L.headerW) return { area: "rowHeader", row: L.rowAtY(y), col: -1 };
  return { area: "cell", row: L.rowAtY(y), col: L.colAtX(x) };
}

/** Sürükleme sırasında (başlık bölgesine taşsa da) parmağın altındaki hücre. */
export function cellUnder(L: GridLayout, x: number, y: number): { row: number; col: number } {
  return { row: L.rowAtY(Math.max(L.headerH, y)), col: L.colAtX(Math.max(L.headerW, x)) };
}

export const MIN_ZOOM = 25;
export const MAX_ZOOM = 400;
const ZOOM_STEPS = [25, 33, 50, 67, 75, 85, 100, 115, 125, 150, 175, 200, 250, 300, 400];

export function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

/** Yakınlaştırma düğmeleri: bir sonraki/önceki basamak. */
export function zoomStep(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 0.5) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 0.5) ?? MIN_ZOOM;
}

/** Odak noktasının altındaki içerik yerinde kalacak şekilde yeni kaydırma (kayan bölme birimiyle). */
export function zoomAround(before: GridLayout, after: GridLayout, fx: number, fy: number, nfx = fx, nfy = fy): { x: number; y: number } {
  // Kayan bölmedeki içerik koordinatı (yakınlaştırmadan bağımsız birim)
  const ux = (Math.max(fx, before.cellsX) - before.cellsX + before.scrollX) / before.z;
  const uy = (Math.max(fy, before.cellsY) - before.cellsY + before.scrollY) / before.z;
  return {
    x: Math.max(0, ux * after.z - (Math.max(nfx, after.cellsX) - after.cellsX)),
    y: Math.max(0, uy * after.z - (Math.max(nfy, after.cellsY) - after.cellsY)),
  };
}

/** Parmak hızını son hareketlerden tahmin eder ve bırakınca sönümlü kaydırma adımları üretir. */
export class Inertia {
  private samples: { t: number; x: number; y: number }[] = [];
  vx = 0;
  vy = 0;

  reset(): void {
    this.samples = [];
    this.vx = 0;
    this.vy = 0;
  }

  /** Parmak konumu (ms zaman damgasıyla). */
  track(t: number, x: number, y: number): void {
    this.samples.push({ t, x, y });
    while (this.samples.length > 2 && t - this.samples[0].t > 100) this.samples.shift();
  }

  /** Bırakma anındaki hız (px/ms, kaydırma yönünde: parmağın tersine). */
  release(t: number): { vx: number; vy: number } {
    const s = this.samples.filter((p) => t - p.t <= 100);
    this.samples = [];
    if (s.length < 2) return { vx: 0, vy: 0 };
    const a = s[0];
    const b = s[s.length - 1];
    const dt = Math.max(8, b.t - a.t);
    // Parmak durup bekledikten sonra bırakıldıysa fırlatma yok
    if (t - b.t > 60) return { vx: 0, vy: 0 };
    const cap = 8;
    this.vx = Math.max(-cap, Math.min(cap, -(b.x - a.x) / dt));
    this.vy = Math.max(-cap, Math.min(cap, -(b.y - a.y) / dt));
    return { vx: this.vx, vy: this.vy };
  }

  /** dt ms sonra kat edilecek yol; hız sönümlenir. Hareket bittiyse null. */
  step(dt: number): { dx: number; dy: number } | null {
    const decay = Math.pow(0.997, dt);
    const dx = this.vx * dt;
    const dy = this.vy * dt;
    this.vx *= decay;
    this.vy *= decay;
    if (Math.abs(this.vx) < 0.03 && Math.abs(this.vy) < 0.03) {
      this.vx = 0;
      this.vy = 0;
      return null;
    }
    return { dx, dy };
  }
}

/** Kaydırma ekseni kilidi: belirgin dikey/yatay sürüklemede diğer eksen sabit kalır. */
export function axisLock(dx: number, dy: number): "x" | "y" | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay > ax * 2) return "y";
  if (ax > ay * 2) return "x";
  return null;
}

export interface Handle {
  kind: "start" | "end";
  x: number;
  y: number;
}

/** Son seçim aralığının sol üst ve sağ alt köşesindeki tutamaçlar (görünür olanlar). */
export function selectionHandles(L: GridLayout, r: Rect): Handle[] {
  const out: Handle[] = [];
  const visible = (row: number, col: number, x: number, y: number) => {
    if (x < L.headerW - 1 || y < L.headerH - 1 || x > L.width + 1 || y > L.height + 1) return false;
    // Kayan bölmedeki köşe dondurulmuş alanın altına girdiyse gösterilmez
    if (row >= L.fr && y < L.cellsY - 1) return false;
    if (col >= L.fc && x < L.cellsX - 1) return false;
    return true;
  };
  if (r.r1 < MAX_ROWS && r.c1 < MAX_COLS) {
    const x = L.colX(r.c1);
    const y = L.rowY(r.r1);
    if (visible(r.r1, r.c1, x, y)) out.push({ kind: "start", x, y });
  }
  if (r.r2 < MAX_ROWS - 1 && r.c2 < MAX_COLS - 1) {
    const x = L.colX(r.c2) + L.colW(r.c2);
    const y = L.rowY(r.r2) + L.rowH(r.r2);
    if (visible(r.r2, r.c2, x, y)) out.push({ kind: "end", x, y });
  }
  return out;
}

export function nearestHandle(handles: Handle[], x: number, y: number, radius: number): Handle | null {
  let best: Handle | null = null;
  let bd = radius * radius;
  for (const h of handles) {
    const d = (h.x - x) ** 2 + (h.y - y) ** 2;
    if (d <= bd) {
      bd = d;
      best = h;
    }
  }
  return best;
}
