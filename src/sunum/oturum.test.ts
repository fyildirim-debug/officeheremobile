import { describe, expect, it } from "vitest";
import { newPresentation } from "@sunum/model/presentation";
import { makeSp } from "@sunum/model/factory";
import { applyRun, growFont, setListStyle, setParaProps } from "@sunum/state/textActions";
import type { SpShape } from "@sunum/model/types";
import { duzenlenebilir, slaytCogalt, slaytEkle, slaytGizle, slaytSil, slaytTasi, yeniOturum } from "./oturum";

function oturum(n = 4) {
  const pres = newPresentation();
  const o = yeniOturum(pres, "Sunu1");
  for (let i = 1; i < n; i++) slaytEkle(o.a, undefined, o.a.s.pres.slides.length - 1);
  o.store.set({ dirty: false });
  return o;
}

const ids = (o: ReturnType<typeof oturum>) => o.a.s.pres.slides.map((s) => s.id);

describe("slayt işlemleri", () => {
  it("yeni slayt seçilen düzende geçerli slayttan sonra eklenir", () => {
    const o = oturum(2);
    const titleOnly = o.a.s.pres.layouts.find((l) => l.type === "titleOnly")!;
    slaytEkle(o.a, titleOnly.id, 0);
    expect(o.a.s.pres.slides).toHaveLength(3);
    expect(o.a.s.slideIdx).toBe(1);
    expect(o.a.s.pres.slides[1].layoutId).toBe(titleOnly.id);
    expect(o.a.s.dirty).toBe(true);
  });

  it("taşı: yukarı/aşağı ve sınırlar", () => {
    const o = oturum(4);
    const [a, b, c, d] = ids(o);
    expect(slaytTasi(o.a, 0, -1)).toBe(false);
    expect(slaytTasi(o.a, 3, 1)).toBe(false);
    expect(slaytTasi(o.a, 1, 1)).toBe(true);
    expect(ids(o)).toEqual([a, c, b, d]);
    expect(o.a.s.slideIdx).toBe(2);
    expect(slaytTasi(o.a, 2, -1)).toBe(true);
    expect(ids(o)).toEqual([a, b, c, d]);
    expect(o.a.s.slideIdx).toBe(1);
  });

  it("çoğalt, gizle, sil ve geri al/yinele", () => {
    const o = oturum(3);
    slaytCogalt(o.a, 1);
    expect(o.a.s.pres.slides).toHaveLength(4);
    expect(o.a.s.slideIdx).toBe(2);
    slaytGizle(o.a, 2);
    expect(o.a.s.pres.slides[2].hidden).toBe(true);
    slaytGizle(o.a, 2);
    expect(o.a.s.pres.slides[2].hidden).toBe(false);
    slaytSil(o.a, 0);
    expect(o.a.s.pres.slides).toHaveLength(3);
    o.store.undo();
    expect(o.a.s.pres.slides).toHaveLength(4);
    o.store.redo();
    expect(o.a.s.pres.slides).toHaveLength(3);
  });

  it("seçili metin kutusuna biçim uygulanır (düzenleme dışında tüm kutu)", () => {
    const o = oturum(1);
    const title = o.a.s.pres.slides[0].shapes.find((s) => s.kind === "sp" && s.ph?.type === "ctrTitle") as SpShape;
    o.store.commit((p) => ({ ...p, slides: [{ ...p.slides[0], shapes: p.slides[0].shapes.map((s) => (s.id === title.id ? { ...title, text: { ...title.text!, paragraphs: [{ runs: [{ text: "Başlık", props: {} }], level: 0, props: {} }] } } : s)) }] }));
    o.a.select([title.id]);
    applyRun(o.a, (p) => ({ ...p, bold: true, color: { rgb: "#C00000" } }));
    growFont(o.a, 1);
    setParaProps(o.a, { align: "r" });
    setListStyle(o.a, { type: "char", char: "•", font: "Arial" }, true);
    const t = o.a.s.pres.slides[0].shapes.find((s) => s.id === title.id) as SpShape;
    const p = t.text!.paragraphs[0];
    expect(p.runs[0].props.bold).toBe(true);
    expect(p.runs[0].props.color).toEqual({ rgb: "#C00000" });
    expect(p.runs[0].props.size).toBeGreaterThan(44);
    expect(p.props.align).toBe("r");
    expect(p.props.bullet?.type).toBe("char");
  });

  it("yalnız metin kutusu ve metin yer tutucusu düzenlenebilir", () => {
    const pres = newPresentation();
    const ph = pres.slides[0].shapes[0];
    expect(duzenlenebilir(ph)).toBe(true);
    const kutu = makeSp("rect", 0, 0, 10, 10, { text: { paragraphs: [{ runs: [], level: 0, props: {} }] } });
    expect(duzenlenebilir(kutu)).toBe(false);
    expect(duzenlenebilir({ ...kutu, txBox: true })).toBe(true);
    expect(duzenlenebilir({ ...kutu, ph: { type: "pic" } })).toBe(false);
  });
});
