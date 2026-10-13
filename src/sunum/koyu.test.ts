import { describe, expect, it } from "vitest";
import { newPresentation } from "@sunum/model/presentation";
import { resolveHex } from "@sunum/model/color";
import type { ChartShape, Presentation, SpShape, TableShape } from "@sunum/model/types";
import { acikSlaytZemini, grafikCss, koyuMurekkep, koyuSunu, koyuZemin, oklch, oklchHex, slaytAcikMi } from "./koyu";

const L = (hex: string) => oklch(hex)[0];

function kutu(id: string, extra: Partial<SpShape>): SpShape {
  return {
    kind: "sp",
    id,
    name: id,
    x: 10,
    y: 10,
    w: 200,
    h: 100,
    rot: 0,
    geom: "rect",
    fill: { type: "none" },
    line: { fill: { type: "none" }, width: 1, dash: "solid" },
    txBox: true,
    text: { paragraphs: [{ runs: [{ text: "Merhaba", props: {} }], level: 0, props: {} }] },
    ...extra,
  };
}

function sunu(): Presentation {
  return newPresentation();
}

describe("renk eşlemesi", () => {
  it("OKLCH gidiş-dönüş renkleri korur", () => {
    for (const hex of ["#FFFFFF", "#000000", "#4472C4", "#C00000", "#FFC000", "#7F7F7F", "#1F3864"]) {
      const [l, c, h] = oklch(hex);
      expect(oklchHex(l, c, h)).toBe(hex);
    }
  });

  it("beyaz zemin koyulaşır, siyah mürekkep açılır", () => {
    expect(L(koyuZemin("#FFFFFF"))).toBeLessThan(0.3);
    expect(koyuZemin("#FFFFFF")).toBe("#1E1E1E");
    expect(L(koyuMurekkep("#000000"))).toBeGreaterThan(0.9);
    // Gri metin de aynı oranda açılır; açık renkler değişmez.
    expect(L(koyuMurekkep("#595959"))).toBeGreaterThan(0.6);
    expect(koyuMurekkep("#FFFFFF")).toBe("#FFFFFF");
    expect(koyuMurekkep("#FFC000")).toBe("#FFC000");
  });

  it("belirgin renkler korunur, renk tonu değişmez", () => {
    for (const hex of ["#4472C4", "#C00000", "#FFFF00", "#00B050", "#000000"]) expect(koyuZemin(hex)).toBe(hex);
    // Lacivert yazı açık maviye döner (ton aynı).
    const [, , h0] = oklch("#1F3864");
    const [l1, , h1] = oklch(koyuMurekkep("#1F3864"));
    expect(l1).toBeGreaterThan(0.7);
    expect(Math.abs(h1 - h0)).toBeLessThan(3);
    // Açık mavi pastel dolgu koyu maviye döner.
    const [lz, , hz] = oklch(koyuZemin("#DEEBF7"));
    expect(lz).toBeLessThan(0.4);
    expect(Math.abs(hz - oklch("#DEEBF7")[2])).toBeLessThan(5);
  });

  it("açık slayt zemini tanınır", () => {
    const t = sunu().theme;
    expect(acikSlaytZemini({ type: "solid", color: { rgb: "#FFFFFF" } }, t)).toBe(true);
    expect(acikSlaytZemini({ type: "solid", color: { scheme: "lt1" } }, t)).toBe(true);
    expect(acikSlaytZemini({ type: "solid", color: { rgb: "#FFF2CC" } }, t)).toBe(true);
    expect(acikSlaytZemini(undefined, t)).toBe(true);
    expect(acikSlaytZemini({ type: "solid", color: { rgb: "#203864" } }, t)).toBe(false);
    expect(acikSlaytZemini({ type: "solid", color: { rgb: "#FFFF00" } }, t)).toBe(false);
    expect(acikSlaytZemini({ type: "image", src: "data:,", mode: "stretch" }, t)).toBe(false);
    expect(acikSlaytZemini({ type: "gradient", kind: "linear", angle: 0, stops: [{ pos: 0, color: { rgb: "#FFFFFF" } }, { pos: 1, color: { rgb: "#E7E6E6" } }] }, t)).toBe(true);
  });
});

describe("koyu sunu kopyası", () => {
  it("beyaz slayt koyu çizilir; özgün sunu değişmez", () => {
    const p = sunu();
    const before = JSON.stringify(p);
    const k = koyuSunu(p);
    const g = k.slayt(0);
    expect(g.koyu).toBe(true);
    expect(g.className).toMatch(/m-sk m-sk-t\d+/);
    const bg = g.slide.background ?? g.pres.layouts.find((l) => l.id === g.slide.layoutId)?.background ?? g.pres.master.background;
    expect(bg.type).toBe("solid");
    if (bg.type === "solid") expect(L(resolveHex(bg.color, g.pres.theme))).toBeLessThan(0.3);
    // Asıl slayt metin stilleri (kalıtılan yazı rengi) açık.
    const run = g.pres.master.textStyles.title[0].run;
    expect(L(resolveHex(run.color, g.pres.theme))).toBeGreaterThan(0.85);
    expect(JSON.stringify(p)).toBe(before);
  });

  it("kalıtılan madde işareti korunur (kopyaya tanımsız anahtar yazılmaz)", () => {
    const p = sunu();
    const l = p.layouts.find((x) => x.type === "obj")!;
    p.slides = [{ ...p.slides[0], id: "s2", layoutId: l.id, shapes: p.slides[0].shapes }];
    const g = koyuSunu(p).slayt(0);
    for (const s of g.slide.shapes) if (s.kind === "sp" && s.text) for (const para of s.text.paragraphs) expect("bullet" in para.props).toBe(false);
  });

  it("koyu zeminli (tasarımlı) slayt olduğu gibi kalır", () => {
    const p = sunu();
    p.slides[0] = { ...p.slides[0], background: { type: "solid", color: { rgb: "#102040" } } };
    expect(slaytAcikMi(p, p.slides[0])).toBe(false);
    const g = koyuSunu(p).slayt(0);
    expect(g.koyu).toBe(false);
    expect(g.pres).toBe(p);
    expect(g.slide).toBe(p.slides[0]);
  });

  it("slaydı kaplayan koyu dikdörtgen ya da resim tasarımlı zemin sayılır", () => {
    const p = sunu();
    const tam = kutu("tam", { x: 0, y: 0, w: p.width, h: p.height, txBox: false, text: undefined, fill: { type: "solid", color: { rgb: "#0B5563" } } });
    p.slides[0] = { ...p.slides[0], shapes: [tam, ...p.slides[0].shapes] };
    expect(slaytAcikMi(p, p.slides[0])).toBe(false);
    // Üstünde yine açık bir kaplama varsa açık sayılır.
    const beyaz = { ...tam, id: "beyaz", fill: { type: "solid" as const, color: { rgb: "#FFFFFF" } } };
    p.slides[0] = { ...p.slides[0], shapes: [tam, beyaz] };
    expect(slaytAcikMi(p, p.slides[0])).toBe(true);
    // Düzende tam sayfa resim (fotoğraf zemini).
    const p2 = sunu();
    const l = p2.layouts.find((x) => x.id === p2.slides[0].layoutId)!;
    l.shapes = [{ kind: "pic", id: "r", name: "r", x: 0, y: 0, w: p2.width, h: p2.height, rot: 0, src: "data:,", line: { fill: { type: "none" }, width: 1, dash: "solid" } }, ...l.shapes];
    expect(slaytAcikMi(p2, p2.slides[0])).toBe(false);
  });

  it("korunan dolgulu kutunun yazısı özgün rengini korur, dolgusuz kutununki açılır", () => {
    const p = sunu();
    const sari = kutu("sari", { fill: { type: "solid", color: { rgb: "#FFFF00" } } });
    const beyaz = kutu("beyaz", { fill: { type: "solid", color: { rgb: "#FFFFFF" } }, line: { fill: { type: "solid", color: { rgb: "#000000" } }, width: 1, dash: "solid" } });
    const bos = kutu("bos", { text: { paragraphs: [{ runs: [{ text: "Açık", props: { color: { rgb: "#202020" } } }], level: 0, props: {} }] } });
    p.slides[0] = { ...p.slides[0], shapes: [sari, beyaz, bos] };
    const g = koyuSunu(p).slayt(0);
    const [s1, s2, s3] = g.slide.shapes as SpShape[];
    expect(s1.fill).toEqual(sari.fill);
    expect(resolveHex(s1.text!.paragraphs[0].runs[0].props.color, g.pres.theme)).toBe("#000000");
    if (s2.fill.type === "solid") expect(L(resolveHex(s2.fill.color, g.pres.theme))).toBeLessThan(0.3);
    if (s2.line.fill.type === "solid") expect(L(resolveHex(s2.line.fill.color, g.pres.theme))).toBeGreaterThan(0.85);
    expect(L(resolveHex(s3.text!.paragraphs[0].runs[0].props.color, g.pres.theme))).toBeGreaterThan(0.75);
    expect(g.shapeClass?.(s3)).toBe("m-ski");
    expect(g.shapeClass?.(s1)).toBeUndefined();
  });

  it("tablo stili hücrelere açıkça yazılır: başlık korunur, gövde koyulaşır", () => {
    const p = sunu();
    const cell = (t: string) => ({ text: { paragraphs: [{ runs: [{ text: t, props: {} }], level: 0, props: {} }] } });
    const tbl: TableShape = {
      kind: "table",
      id: "t",
      name: "Tablo",
      x: 0,
      y: 0,
      w: 400,
      h: 80,
      rot: 0,
      cols: [200, 200],
      rows: [
        { h: 40, cells: [cell("A"), cell("B")] },
        { h: 40, cells: [cell("1"), cell("2")] },
      ],
      style: { styleId: "medium2-accent1", firstRow: true, lastRow: false, firstCol: false, lastCol: false, bandRow: true, bandCol: false },
    };
    p.slides[0] = { ...p.slides[0], shapes: [tbl] };
    const g = koyuSunu(p).slayt(0);
    const t2 = g.slide.shapes[0] as TableShape;
    const head = t2.rows[0].cells[0];
    const body = t2.rows[1].cells[0];
    expect(head.fill?.type).toBe("solid");
    if (head.fill?.type === "solid") expect(resolveHex(head.fill.color, g.pres.theme)).toBe(resolveHex({ scheme: "accent1" }, p.theme));
    expect(resolveHex(head.text.paragraphs[0].runs[0].props.color, g.pres.theme)).toBe("#FFFFFF");
    if (body.fill?.type === "solid") expect(L(resolveHex(body.fill.color, g.pres.theme))).toBeLessThan(0.45);
    expect(L(resolveHex(body.text.paragraphs[0].runs[0].props.color, g.pres.theme))).toBeGreaterThan(0.85);
  });

  it("grafik işaretlenir; koyu stilli grafik değişmez", () => {
    const p = sunu();
    const chart = (id: string, style?: number): ChartShape => ({ kind: "chart", id, name: id, x: 0, y: 0, w: 400, h: 300, rot: 0, chart: { type: "col", showTitle: true, categories: ["a"], series: [{ name: "s", values: [1] }], legend: "b", style } });
    p.slides[0] = { ...p.slides[0], shapes: [chart("c1"), chart("c2", 6)] };
    const g = koyuSunu(p).slayt(0);
    expect(g.shapeClass?.(g.slide.shapes[0])).toBe("m-skc");
    expect(g.shapeClass?.(g.slide.shapes[1])).toBeUndefined();
    const css = grafikCss(p.theme, ".m-sk-t1");
    expect(css).toContain(`[fill="${resolveHex({ scheme: "dk1", lumMod: 0.65, lumOff: 0.35 }, p.theme)}" i]`);
    expect(css).toContain('[stroke="#fff" i]');
  });

  it("değişmeyen slaydın kopyası önbellekten gelir (küçük resim yeniden çizilmez)", () => {
    const p = sunu();
    const a = koyuSunu(p).slayt(0);
    const p2: Presentation = { ...p, slides: [...p.slides] };
    const b = koyuSunu(p2).slayt(0);
    expect(b.slide).toBe(a.slide);
    expect(b.pres.master).toBe(a.pres.master);
    expect(b.pres.layouts).toBe(a.pres.layouts);
    expect(b.pres.theme).toBe(a.pres.theme);
  });
});
