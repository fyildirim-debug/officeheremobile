import { describe, expect, it } from "vitest";
import type { ChartDef } from "@tablo/model/types";
import { chartMapped, objectsDarkCss } from "./darkObjects";
import { darkGround, ink } from "./darkCanvas";

const chart = (p: Partial<ChartDef>): ChartDef => ({ id: "c1", type: "column", range: "A1:B3", seriesInRows: false, title: "G", showTitle: true, showLegend: true, legendPos: "bottom", showDataLabels: false, showGridlines: true, palette: 0, style: 1, anchor: { row: 0, col: 0, dx: 0, dy: 0 }, width: 300, height: 200, ...p });

describe("koyu temada grafik ve nesne kutuları", () => {
  it("açık zeminli grafik eşlenir, tasarımlı koyu/belirgin zemin aynen kalır", () => {
    expect(chartMapped(chart({}))).toBe(true);
    expect(chartMapped(chart({ style: 2 }))).toBe(true);
    expect(chartMapped(chart({ style: 4 }))).toBe(false);
    expect(chartMapped(chart({ style: 7 }))).toBe(false);
    expect(chartMapped(chart({ fill: "#FFC000" }))).toBe(false);
  });

  it("zemin koyu, yazılar açık, kılavuz koyu ton; seri renkleri için kural yok", () => {
    const css = objectsDarkCss([chart({}), chart({ id: "c2", style: 4 })], ".k");
    expect(css).toContain(`rect[data-el="area"]{fill:${darkGround("#FFFFFF")}}`);
    expect(css).toContain(`:is(text,g)[fill="#595959" i]{fill:${ink("#595959")}}`);
    expect(css).toContain(`line[stroke="#D9D9D9" i]{stroke:${darkGround("#D9D9D9")}}`);
    expect(css).not.toContain("#262626\" i]");
    expect(css).not.toMatch(/tb-chart-mark\)?\{fill/);
    // Dilimleyici ve özet tablo yer tutucusu da koyulaşır
    expect(css).toContain(".k .tb-slicer{background:#1E1E1E");
    expect(css).toContain(".k .tb-pv-placeholder{");
  });
});
