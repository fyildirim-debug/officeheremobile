// @vitest-environment jsdom
// Koyu Sayfa dolgu ve grafik kuralları: Tablo/Sunum ile aynı ölçüt (açık nötr/pastel koyulaşır, belirgin kalır).
import { describe, expect, it } from "vitest";
import { Node as PMNode } from "@tiptap/pm/model";
import type { JSONContent } from "@tiptap/core";
import { belgeSchema } from "@belge/io";
import { defaultSettings, normalizeDoc } from "@belge/model/document";
import { resolveStyles } from "@belge/model/styles";
import { darkGround, ink } from "../tablo/darkCanvas";
import { koyuNesneCss, sabitKoyuCss, zeminRenkleri } from "./koyuNesneler";

const t = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text, ...(marks ? { marks } : {}) });
const doc = (...content: JSONContent[]) => PMNode.fromJSON(belgeSchema(), normalizeDoc({ type: "doc", content }));

describe("koyu sayfa dolguları", () => {
  it("belgedeki zemin renkleri toplanır (kutu, gölgelendirme, hücre, yazı zemini, vurgu, üst bilgi)", () => {
    const d = doc(
      { type: "paragraph", attrs: { shading: "#E2EFD9" }, content: [t("a", [{ type: "textStyle", attrs: { backgroundColor: "#FFF2CC" } }]), t("b", [{ type: "highlight", attrs: { color: "#FFFF00" } }])] },
      { type: "textBox", attrs: { fill: "#DAE9F7" }, content: [{ type: "paragraph" }] },
      { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: { background: "#1F3864" }, content: [{ type: "paragraph" }] }] }] },
    );
    const s = defaultSettings();
    s.header = { type: "doc", content: [{ type: "paragraph", attrs: { shading: "#EDEDED" } }] };
    expect(zeminRenkleri(d, s).sort()).toEqual(["#1F3864", "#DAE9F7", "#E2EFD9", "#EDEDED", "#FFF2CC", "#FFFF00"]);
  });

  it("pastel ve açık nötr dolgu koyulaşır (her yazım biçimi), belirgin dolgu kâğıttaki gibi kalır", () => {
    const css = koyuNesneCss(["#E2EFD9", "#FFFF00", "#1F3864"]);
    expect(css).toContain(`background-color:${darkGround("#E2EFD9")} !important`);
    expect(css).toContain('[style*="background-color: rgb(226, 239, 217)"]');
    expect(css).toContain('[style*="background:#E2EFD9;" i]');
    expect(css).toContain('[data-bg="#E2EFD9" i]');
    expect(css).not.toContain(darkGround("#1F3864") + " !important");
    expect(css).not.toContain("rgb(255, 255, 0)");
    // Kâğıt kuralı koyulaşan dolguyu dışarıda bırakır; içindeki koyulaşan dolgu yine açık metinle.
    expect(css).toMatch(/:not\(:is\(\[style\*="background-color:#E2EFD9;" i\]/);
    expect(css).toContain("-webkit-text-fill-color:currentColor");
    expect(css).toContain("oklch(from currentColor");
  });

  it("açık temada kural yok; renk listesi boşsa yalnız kâğıt kuralı", () => {
    const css = koyuNesneCss([]);
    expect(css).not.toContain("!important");
    expect(css.split("\n")).toHaveLength(1);
  });

  it("paragraf stili gölgelendirmesi stil seçicisiyle koyulaşır", () => {
    const styles = resolveStyles("default", "OfficeHere");
    styles.Quote = { ...styles.Quote, props: { ...styles.Quote.props, shading: "#F2F2F2" } };
    expect(koyuNesneCss([], styles)).toContain(`p[data-style="Quote"]{background-color:${darkGround("#F2F2F2")}}`);
  });

  it("tablo stilleri ve grafik: açık bant/başlık koyulaşır, koyu başlık kalır; grafik zemini #1E1E1E, yazı açık", () => {
    const css = sabitKoyuCss();
    expect(css).toContain(`table[data-table-style="light-blue"][data-header-row="true"] tr:first-child > *{background:${darkGround("#dae9f7")}}`);
    expect(css).toContain(`table[data-table-style="grid-blue"][data-banded-rows="true"] tr:nth-child(even of :not(.bl-pg)) > *:not([data-bg]){background:${darkGround("#c1e4f5")}}`);
    expect(css).not.toContain(darkGround("#156082") === "#156082" ? "background:#156082" : "x");
    expect(css).toMatch(/grid-blue"\]\[data-header-row="true"\] tr:first-child > \* \*\{-webkit-text-fill-color:currentColor/);
    expect(darkGround("#FFFFFF")).toBe("#1E1E1E");
    expect(css).toContain(`> rect:first-child{fill:#1E1E1E`);
    expect(css).toContain(`text[fill="#595959" i]{fill:${ink("#595959")}}`);
    expect(css).toContain("background:transparent");
  });
});
