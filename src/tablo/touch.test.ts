import { describe, expect, it } from "vitest";
import { WorkbookModel } from "@tablo/model/workbook";
import { GridLayout } from "@tablo/grid/layout";
import { Inertia, axisLock, cellAtPoint, cellUnder, nearestHandle, selectionHandles, zoomAround, zoomStep } from "./touch";

// Başlık genişliği ölçümü: basamak başına 8 px (DOM'suz)
const digits = (n: number) => n * 8;

function layout(opts: { zoom?: number; frozen?: { rows: number; cols: number }; sx?: number; sy?: number } = {}) {
  const wb = new WorkbookModel();
  const sh = wb.active;
  sh.zoom = opts.zoom ?? 100;
  if (opts.frozen) sh.frozen = opts.frozen;
  return { sh, L: new GridLayout(sh, 400, 800, opts.sx ?? 0, opts.sy ?? 0, digits) };
}

describe("dokunma noktasından hücre", () => {
  it("başlıklar, köşe ve hücreler", () => {
    const { L } = layout();
    // Varsayılan: sütun 64 px, satır 20 px; başlıklar 34 x 20
    expect(L.headerW).toBe(34);
    expect(L.headerH).toBe(20);
    expect(cellAtPoint(L, 10, 10).area).toBe("corner");
    expect(cellAtPoint(L, 34 + 64 + 5, 8)).toEqual({ area: "colHeader", row: -1, col: 1 });
    expect(cellAtPoint(L, 10, 20 + 40 + 1)).toEqual({ area: "rowHeader", row: 2, col: -1 });
    expect(cellAtPoint(L, 34 + 1, 20 + 1)).toEqual({ area: "cell", row: 0, col: 0 });
    expect(cellAtPoint(L, 34 + 3 * 64 + 10, 20 + 7 * 20 + 10)).toEqual({ area: "cell", row: 7, col: 3 });
    expect(cellAtPoint(L, -5, 100).area).toBe("none");
  });

  it("kaydırma ve yakınlaştırmayı hesaba katar", () => {
    const { L } = layout({ zoom: 200, sx: 128, sy: 400 });
    // %200: sütun 128, satır 40 px; 128 px sağa = 1 sütun, 400 px aşağı = 10 satır kaydı
    const hit = cellAtPoint(L, L.headerW + 5, L.headerH + 5);
    expect(hit).toEqual({ area: "cell", row: 10, col: 1 });
    expect(cellAtPoint(L, L.headerW + 130, L.headerH + 81)).toEqual({ area: "cell", row: 12, col: 2 });
  });

  it("dondurulmuş bölmeler kaymaz", () => {
    const { L } = layout({ frozen: { rows: 2, cols: 1 }, sx: 640, sy: 2000 });
    // Dondurulmuş satır/sütun yerinde; kayan bölme 100 satır, 10 sütun ötede
    expect(cellAtPoint(L, L.headerW + 5, L.headerH + 25)).toEqual({ area: "cell", row: 1, col: 0 });
    expect(cellAtPoint(L, L.cellsX + 5, L.cellsY + 5)).toEqual({ area: "cell", row: 102, col: 11 });
    // Başlık bölgesine taşan sürükleme ilk hücrelere kenetlenir
    expect(cellUnder(L, 0, 0)).toEqual({ row: 0, col: 0 });
  });
});

describe("kıstırma ve yakınlaştırma", () => {
  it("odak noktasının altındaki hücre yerinde kalır", () => {
    const { sh, L: before } = layout({ sx: 300, sy: 500 });
    const fx = 200;
    const fy = 400;
    const cell = cellAtPoint(before, fx, fy);
    sh.zoom = 250;
    const after = new GridLayout(sh, 400, 800, 0, 0, digits);
    const p = zoomAround(before, after, fx, fy);
    const L2 = new GridLayout(sh, 400, 800, p.x, p.y, digits);
    expect(cellAtPoint(L2, fx, fy)).toEqual(cell);
  });

  it("düğme basamakları", () => {
    expect(zoomStep(100, 1)).toBe(115);
    expect(zoomStep(100, -1)).toBe(85);
    expect(zoomStep(400, 1)).toBe(400);
    expect(zoomStep(25, -1)).toBe(25);
    expect(zoomStep(137, 1)).toBe(150);
  });
});

describe("eylemsizlik", () => {
  it("parmak hızından fırlatma ve sönüm", () => {
    const ine = new Inertia();
    // 100 ms'de 200 px yukarı: kaydırma aşağı 2 px/ms
    for (let t = 0; t <= 100; t += 10) ine.track(t, 100, 500 - t * 2);
    const v = ine.release(105);
    expect(v.vx).toBeCloseTo(0);
    expect(v.vy).toBeCloseTo(2, 1);
    let total = 0;
    let steps = 0;
    for (let d = ine.step(16); d; d = ine.step(16)) {
      total += d.dy;
      steps++;
    }
    expect(total).toBeGreaterThan(300);
    expect(steps).toBeLessThan(200);
  });

  it("durup bırakınca fırlatma yok", () => {
    const ine = new Inertia();
    ine.track(0, 0, 0);
    ine.track(50, 0, -100);
    expect(ine.release(400)).toEqual({ vx: 0, vy: 0 });
  });

  it("eksen kilidi", () => {
    expect(axisLock(2, 30)).toBe("y");
    expect(axisLock(-40, 5)).toBe("x");
    expect(axisLock(20, 25)).toBeNull();
  });
});

describe("seçim tutamaçları", () => {
  it("köşelerde görünür, dokunma yarıçapında bulunur", () => {
    const { L } = layout();
    const hs = selectionHandles(L, { r1: 1, c1: 1, r2: 3, c2: 2 });
    expect(hs).toEqual([
      { kind: "start", x: 34 + 64, y: 20 + 20 },
      { kind: "end", x: 34 + 3 * 64, y: 20 + 4 * 20 },
    ]);
    expect(nearestHandle(hs, 34 + 3 * 64 + 10, 20 + 80 - 8, 24)?.kind).toBe("end");
    expect(nearestHandle(hs, 300, 600, 24)).toBeNull();
  });

  it("kaydırılıp gizlenen köşe gösterilmez", () => {
    const { L } = layout({ sy: 200 });
    expect(selectionHandles(L, { r1: 0, c1: 0, r2: 0, c2: 0 })).toEqual([]);
  });
});
