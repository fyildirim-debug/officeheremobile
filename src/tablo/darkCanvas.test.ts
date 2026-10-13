import { describe, expect, it } from "vitest";
import { DARK_BG, DARK_GRID, darkContext, darkGround, ink, isWhite, lightNeutral, lightness, parseColor } from "./darkCanvas";

describe("renk çevirisi", () => {
  it("renk ayrıştırma", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255, 1]);
    expect(parseColor("#1F4E79")).toEqual([31, 78, 121, 1]);
    expect(parseColor("rgba(20, 110, 60, 0.12)")).toEqual([20, 110, 60, 0.12]);
    expect(parseColor("bilinmeyen")).toBeNull();
    expect(isWhite("#FFFFFF")).toBe(true);
    expect(isWhite("#FFFFFE")).toBe(true);
    expect(isWhite("#F2F2F2")).toBe(false);
  });

  it("koyu renk aynı tonda açılır, açık renk aynen kalır (Belge Koyu Sayfa kuralı)", () => {
    expect(ink("#000000")).toBe("rgb(228,228,228)");
    expect(ink("#FFFF00")).toBe("#FFFF00");
    const red = ink("#800000");
    expect(lightness(red)!).toBeGreaterThan(0.6);
    const p = parseColor(red)!;
    expect(p[0]).toBeGreaterThan(p[1]);
  });
});

/** Çağrıları kaydeden sahte tuval bağlamı. */
function fakeCtx() {
  const calls: { op: string; style: unknown }[] = [];
  const ctx: Record<string, unknown> = {
    fillStyle: "#000000",
    strokeStyle: "#000000",
    save() {},
    restore() {},
    setTransform() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fillRect() {
      calls.push({ op: "fillRect", style: ctx.fillStyle });
    },
    fillText() {
      calls.push({ op: "fillText", style: ctx.fillStyle });
    },
    fill() {
      calls.push({ op: "fill", style: ctx.fillStyle });
    },
    measureText: (t: string) => ({ width: t.length * 7 }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("zemin kuralı (Sunum ile aynı)", () => {
  it("açık nötr ve pastel koyulaşır, belirgin renk aynen kalır", () => {
    expect(lightNeutral("#FFFFFF")).toBe(true);
    expect(lightNeutral("#DDEBF7")).toBe(true);
    expect(lightNeutral("#FFFF00")).toBe(false);
    expect(lightNeutral("#1F4E79")).toBe(false);
    expect(darkGround("#FFFFFF")).toBe("#1E1E1E");
    expect(darkGround("#FFFF00")).toBe("#FFFF00");
    const p = parseColor(darkGround("#DDEBF7"))!;
    expect(lightness(darkGround("#DDEBF7"))!).toBeLessThan(0.35);
    expect(p[2]).toBeGreaterThan(p[0]);
  });
});

describe("koyu tuval vekili", () => {
  const probe = { headerW: 30, headerH: 20, thin: 3, paper: (x: number) => x >= 200 };

  it("zemin, kılavuz ve dolgusuz metin koyulaşır; dolgulu hücre kâğıttaki gibi kalır", () => {
    const { ctx, calls } = fakeCtx();
    const d = darkContext(ctx, probe);
    d.fillStyle = "#FFFFFF";
    d.fillRect(0, 0, 400, 400);
    d.fillStyle = "#D4D4D4";
    d.fillRect(100, 20, 1, 300);
    d.fillStyle = "#000000";
    d.fillText("dolgusuz", 50, 60);
    d.fillText("dolgulu", 250, 60);
    d.fillStyle = "#FFFF00";
    d.fillRect(200, 40, 64, 20);
    d.fillStyle = "#DDEBF7";
    d.fillRect(40, 40, 64, 20);
    expect(calls.map((c) => c.style)).toEqual([DARK_BG, DARK_GRID, "rgb(228,228,228)", "#000000", "#FFFF00", darkGround("#DDEBF7")]);
  });

  it("başlık bölgesi masaüstünün koyu paletiyle aynen çizilir", () => {
    const { ctx, calls } = fakeCtx();
    const d = darkContext(ctx, probe);
    d.fillStyle = "#2B2B2B";
    d.fillRect(0, 0, 400, 20);
    d.fillStyle = "#464646";
    d.fillRect(0, 19, 400, 1);
    d.fillStyle = "#3B3B3B";
    d.fillText("A", 60, 12);
    expect(calls.map((c) => c.style)).toEqual(["#2B2B2B", "#464646", "#3B3B3B"]);
  });

  it("dolgusuz alandaki siyah kenarlık açılır, iki yanı dolgulu kenarlık kalır", () => {
    const { ctx, calls } = fakeCtx();
    const d = darkContext(ctx, probe);
    d.fillStyle = "#000000";
    d.fillRect(50, 100, 64, 1);
    d.fillRect(250, 100, 64, 1);
    expect(calls.map((c) => c.style)).toEqual(["rgb(228,228,228)", "#000000"]);
  });

  it("diğer özellikler gerçek bağlama iletilir", () => {
    const { ctx } = fakeCtx();
    const d = darkContext(ctx, probe);
    expect(d.measureText("abc").width).toBe(21);
    d.fillStyle = "#123456";
    expect(d.fillStyle).toBe("#123456");
  });
});
