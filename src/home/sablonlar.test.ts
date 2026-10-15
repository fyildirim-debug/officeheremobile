// Başlangıç ekranındaki şablon listesi masaüstü şablonlarıyla aynı olmalı; her şablon kurulabilmeli.
import { describe, expect, it } from "vitest";
import { RESMI_KUME_ID, TEMPLATES as BELGE } from "@belge/templates/templates";
import { TEMPLATES as TABLO, buildTemplate } from "@tablo/templates";
import { TEMPLATES as SUNUM } from "@sunum/templates/templates";
import { SABLONLAR, sablondanYeni } from "./sablonlar";

const liste = (app: string) => SABLONLAR.filter((s) => s.app === app).map((s) => [s.id, s.label]);
// "Resmî yazışma" kümesi masaüstünde alan formlu ayrı galeriyle açılır; mobilde henüz yok.
const masaustu = (t: { id: string; label: string; kume?: string }[]) =>
  t.filter((x) => x.id !== "blank" && x.id !== RESMI_KUME_ID && !x.kume).map((x) => [x.id, x.label]);

describe("şablonlar", () => {
  it("masaüstü şablon listeleriyle aynı (boş belge hariç)", () => {
    expect(liste("belge")).toEqual(masaustu(BELGE));
    expect(liste("tablo")).toEqual(masaustu(TABLO));
    expect(liste("sunum")).toEqual(masaustu(SUNUM));
  });

  it("şablondan yeni belge adı ve uygulaması", () => {
    expect(sablondanYeni(SABLONLAR[0])).toEqual({ name: "Mektup.docx", data: null, app: "belge", template: "letter" });
    expect(sablondanYeni(SABLONLAR.find((s) => s.id === "budget")!)).toMatchObject({ name: "Aylık Bütçe.xlsx", app: "tablo" });
  });

  it("her şablon kurulur", () => {
    for (const t of BELGE) expect(t.build().content.type).toBe("doc");
    for (const t of TABLO) expect(buildTemplate(t.id).sheets.length).toBeGreaterThan(0);
    for (const t of SUNUM) expect(t.build().slides.length).toBeGreaterThan(0);
  });
});
