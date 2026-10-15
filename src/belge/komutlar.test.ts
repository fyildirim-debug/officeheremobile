// @vitest-environment jsdom
// Mobil biçim komutları: paragraf boşluğu (tablo içi atlanır), etkin boşluk (stilden), sayfa yapısı önayarları.
import { afterEach, describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { Selection, TextSelection } from "@tiptap/pm/state";
import { schemaExtensions } from "@belge/editor/extensions";
import { defaultPage, normalizeDoc } from "@belge/model/document";
import { resolveStyles } from "@belge/model/styles";
import { MobilKoruma } from "./koruma";
import { kagitBoyutu, kenarBosluklari, paragrafBoslugu, paragrafBosluklari, yonlendirme } from "./komutlar";

const t = (text: string): JSONContent => ({ type: "text", text });
const p = (...c: JSONContent[]): JSONContent => ({ type: "paragraph", content: c });
const cell = (text: string): JSONContent => ({ type: "tableCell", content: [p(t(text))] });

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function kur() {
  const content = normalizeDoc({
    type: "doc",
    content: [{ type: "heading", attrs: { level: 1 }, content: [t("Başlık")] }, p(t("Bir")), { type: "table", content: [{ type: "tableRow", content: [cell("A1")] }] }, p(t("İki"))],
  });
  editor = new Editor({ extensions: [...schemaExtensions(), MobilKoruma], content });
  return editor;
}

const attrs = (ed: Editor) => {
  const out: Record<string, { spaceBefore: unknown; spaceAfter: unknown }> = {};
  ed.state.doc.descendants((n) => {
    if (n.isTextblock) out[n.textContent] = { spaceBefore: n.attrs.spaceBefore, spaceAfter: n.attrs.spaceAfter };
    return true;
  });
  return out;
};

describe("paragraf boşluğu", () => {
  it("seçimdeki paragraflara uygulanır, tablo içi atlanır; sınırlar içinde", () => {
    const ed = kur();
    const doc = ed.state.doc;
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.between(Selection.atStart(doc).$from, Selection.atEnd(doc).$to)));
    expect(paragrafBoslugu(ed, "spaceBefore", 12)).toBe(3);
    expect(paragrafBoslugu(ed, "spaceAfter", 0)).toBe(3);
    const a = attrs(ed);
    expect(a["Başlık"]).toEqual({ spaceBefore: 12, spaceAfter: 0 });
    expect(a["Bir"]).toEqual({ spaceBefore: 12, spaceAfter: 0 });
    expect(a["İki"]).toEqual({ spaceBefore: 12, spaceAfter: 0 });
    expect(a["A1"]).toEqual({ spaceBefore: null, spaceAfter: null });
    // Sınırlar
    paragrafBoslugu(ed, "spaceAfter", 5000);
    expect(attrs(ed)["Bir"].spaceAfter).toBe(1584);
  });

  it("etkin boşluk: kendi değeri yoksa stilinki", () => {
    const styles = resolveStyles("default", "OfficeHere");
    expect(paragrafBosluklari({ styleId: "Normal", spaceBefore: null, spaceAfter: null }, styles)).toEqual({ once: 0, sonra: 8 });
    expect(paragrafBosluklari({ styleId: "Heading1", spaceBefore: null, spaceAfter: null }, styles)).toEqual({ once: 18, sonra: 4 });
    expect(paragrafBosluklari({ styleId: "Normal", spaceBefore: 6, spaceAfter: 0 }, styles)).toEqual({ once: 6, sonra: 0 });
    expect(paragrafBosluklari({ styleId: "Yok", spaceBefore: null, spaceAfter: null }, styles)).toEqual({ once: 0, sonra: 0 });
  });
});

describe("sayfa yapısı", () => {
  it("A5, yatay ve dar kenar boşlukları", () => {
    const a4 = defaultPage();
    const a5 = kagitBoyutu(a4, "A5");
    expect([a5.width, a5.height]).toEqual([8391, 11906]);
    const yatay = yonlendirme(a5, "landscape");
    expect([yatay.width, yatay.height, yatay.orientation]).toEqual([11906, 8391, "landscape"]);
    // Yatayken boyut değişince yön korunur
    expect([kagitBoyutu(yatay, "A4").width, kagitBoyutu(yatay, "A4").height]).toEqual([16838, 11906]);
    expect(yonlendirme(a5, "portrait")).toBe(a5);
    expect(kenarBosluklari(a5, "narrow").margin).toMatchObject({ top: 720, bottom: 720, left: 720, right: 720, header: a4.margin.header });
    expect(kagitBoyutu(a4, "yok")).toBe(a4);
  });
});
