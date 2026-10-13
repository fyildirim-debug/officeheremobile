// @vitest-environment jsdom
// Mobil nesne koruması: tablo/metin kutusu içi, resim boyutu ve yeni nesne eklemek engelli; bütün silme ve geri alma serbest.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { schemaExtensions } from "@belge/editor/extensions";
import { normalizeDoc } from "@belge/model/document";
import { MobilKoruma, guvenliAraliklar, islemeIzinVar, korumaDurumu, secimKorumali, silinenNesneler } from "./koruma";
import { aralikta, hizala, isaretDegistir, stilUygula, yaziRengi } from "./komutlar";
import { resolveStyles } from "@belge/model/styles";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGM4IScHRww4OQD1xwwxB+utmQAAAABJRU5ErkJggg==";
const t = (text: string): JSONContent => ({ type: "text", text });
const p = (...c: JSONContent[]): JSONContent => ({ type: "paragraph", content: c });
const cell = (text: string): JSONContent => ({ type: "tableCell", content: [p(t(text))] });
const tablo: JSONContent = { type: "table", content: [{ type: "tableRow", content: [cell("A1"), cell("B1")] }, { type: "tableRow", content: [cell("A2"), cell("B2")] }] };
const kutu: JSONContent = { type: "textBox", content: [p(t("Kutu metni"))] };

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function kur(onEngel = vi.fn()) {
  const content = normalizeDoc({ type: "doc", content: [p(t("Önce")), tablo, p(t("Arada "), { type: "image", attrs: { src: PNG, width: 40, height: 30 } }), kutu, p(t("Sonra"))] });
  editor = new Editor({ extensions: [...schemaExtensions(), MobilKoruma.configure({ onEngel })], content });
  return { ed: editor, onEngel };
}

/** Metnin belgedeki konumu. */
function konum(ed: Editor, metin: string): number {
  let at = -1;
  ed.state.doc.descendants((n, pos) => {
    if (at < 0 && n.isText && n.text?.includes(metin)) at = pos + n.text.indexOf(metin);
    return at < 0;
  });
  if (at < 0) throw new Error(metin);
  return at;
}

function dugum(ed: Editor, tur: string): number {
  let at = -1;
  ed.state.doc.descendants((n, pos) => {
    if (at < 0 && n.type.name === tur) at = pos;
    return at < 0;
  });
  return at;
}

describe("mobil koruma", () => {
  it("tablo hücresine yazmak engellenir, paragrafa yazmak serbest", () => {
    const { ed, onEngel } = kur();
    const once = ed.getJSON();
    ed.chain().setTextSelection(konum(ed, "A1") + 1).insertContent("X").run();
    expect(ed.getJSON()).toEqual(once);
    expect(ed.state.doc.textContent).toContain("A1");
    expect(onEngel).toHaveBeenCalled();
    ed.chain().setTextSelection(konum(ed, "Önce") + 4).insertContent("!").run();
    expect(ed.state.doc.textContent).toContain("Önce!");
  });

  it("hücrede Enter/silme ve metin kutusuna yazma engellenir", () => {
    const { ed } = kur();
    const once = ed.getJSON();
    ed.chain().setTextSelection(konum(ed, "B2") + 1).splitBlock().run();
    ed.chain().setTextSelection({ from: konum(ed, "B2"), to: konum(ed, "B2") + 2 }).deleteSelection().run();
    ed.chain().setTextSelection(konum(ed, "Kutu") + 2).insertContent("y").run();
    expect(ed.getJSON()).toEqual(once);
  });

  it("tablo hücresi içi biçimlendirme ve sütun/satır işlemleri engellenir", () => {
    const { ed } = kur();
    const once = ed.getJSON();
    ed.chain().setTextSelection({ from: konum(ed, "A1"), to: konum(ed, "A1") + 2 }).toggleBold().run();
    ed.chain().setTextSelection(konum(ed, "A1") + 1).addRowAfter().run();
    ed.chain().setTextSelection(konum(ed, "A1") + 1).deleteColumn().run();
    expect(ed.getJSON()).toEqual(once);
  });

  it("resim boyutlandırma/öznitelik değişikliği engellenir, yeni tablo/resim eklenemez", () => {
    const { ed } = kur();
    const once = ed.getJSON();
    const img = dugum(ed, "image");
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, img)));
    ed.commands.updateAttributes("image", { width: 400, height: 300 });
    ed.view.dispatch(ed.state.tr.setNodeAttribute(img, "width", 10));
    ed.chain().setTextSelection(konum(ed, "Sonra")).insertTable({ rows: 2, cols: 2 }).run();
    ed.chain().setTextSelection(konum(ed, "Sonra")).setImage({ src: PNG }).run();
    expect(ed.getJSON()).toEqual(once);
  });

  it("tablo bütün olarak silinebilir ve geri alınabilir; silinen nesne bildirilir", () => {
    const { ed } = kur();
    const pos = dugum(ed, "table");
    const node = ed.state.doc.nodeAt(pos)!;
    const tr = ed.state.tr.delete(pos, pos + node.nodeSize);
    expect(islemeIzinVar(tr)).toBe(true);
    expect(silinenNesneler([tr])).toEqual(["table"]);
    ed.view.dispatch(tr);
    expect(dugum(ed, "table")).toBe(-1);
    ed.commands.undo();
    expect(dugum(ed, "table")).toBeGreaterThan(0);
    expect(ed.state.doc.textContent).toContain("A1");
  });

  it("tabloyu kapsayan seçimle silmek serbest; yarısı tabloda olan seçimle silmek engelli", () => {
    const { ed } = kur();
    const yarim = ed.state.tr.delete(konum(ed, "Önce"), konum(ed, "A1") + 1);
    expect(islemeIzinVar(yarim)).toBe(false);
    const tum = ed.state.tr.delete(konum(ed, "Önce"), konum(ed, "Arada"));
    expect(islemeIzinVar(tum)).toBe(true);
  });

  it("sürükle-bırak taşıması engellenir; yükleme sırasında her şey serbest", () => {
    const { ed } = kur();
    const tr = ed.state.tr.insertText("x", konum(ed, "Sonra")).setMeta("uiEvent", "drop");
    expect(islemeIzinVar(tr)).toBe(false);
    const ic = ed.state.tr.insertText("x", konum(ed, "A1") + 1);
    expect(islemeIzinVar(ic)).toBe(false);
    korumaDurumu.serbest = true;
    try {
      expect(islemeIzinVar(ic)).toBe(true);
    } finally {
      korumaDurumu.serbest = false;
    }
  });

  it("kapsayıcılar contenteditable=false çizilir", () => {
    const { ed } = kur();
    const korunan = ed.view.dom.querySelectorAll("[data-m-korumali]");
    expect(korunan.length).toBe(2);
    korunan.forEach((el) => expect(el.getAttribute("contenteditable")).toBe("false"));
  });

  it("tablo, resim içeren pano içeriği düz metin olarak yapıştırılır", () => {
    // jsdom'da ClipboardEvent yok.
    if (typeof ClipboardEvent === "undefined") vi.stubGlobal("ClipboardEvent", class extends Event {});
    const { ed } = kur();
    ed.commands.setTextSelection(konum(ed, "Sonra"));
    ed.view.pasteHTML("<table><tr><td>Yapışan hücre</td></tr></table><p>Metin <img src='" + PNG + "'></p>");
    let tablolar = 0;
    let resimler = 0;
    ed.state.doc.descendants((n) => {
      if (n.type.name === "table") tablolar++;
      if (n.type.name === "image") resimler++;
    });
    expect(tablolar).toBe(1);
    expect(resimler).toBe(1);
    expect(ed.state.doc.textContent).toContain("Yapışan hücre");
  });
});

describe("korumalı aralıklar ve komutlar", () => {
  it("güvenli aralıklar kapsayıcıları atlar", () => {
    const { ed } = kur();
    const doc = ed.state.doc;
    const tbl = dugum(ed, "table");
    const tblEnd = tbl + doc.nodeAt(tbl)!.nodeSize;
    const r = guvenliAraliklar(doc, 1, doc.content.size - 1);
    expect(r.length).toBe(3);
    expect(r[0].to).toBe(tbl);
    expect(r[1].from).toBe(tblEnd);
    expect(guvenliAraliklar(doc, konum(ed, "A1"), konum(ed, "B2"))).toEqual([]);
  });

  it("seçim tablo içindeyse korumalı sayılır", () => {
    const { ed } = kur();
    ed.commands.setTextSelection(konum(ed, "A1") + 1);
    expect(secimKorumali(ed.state)).toBe(true);
    ed.commands.setTextSelection(konum(ed, "Önce") + 1);
    expect(secimKorumali(ed.state)).toBe(false);
  });

  it("tümünü seçip kalın: paragraflar kalın olur, tablo ve kutu metni değişmez (tek işlem)", () => {
    const { ed } = kur();
    ed.commands.selectAll();
    expect(isaretDegistir(ed, "bold", false)).toBe(true);
    const marks = (metin: string) => ed.state.doc.nodeAt(konum(ed, metin))!.marks.map((m) => m.type.name);
    expect(marks("Önce")).toContain("bold");
    expect(marks("Sonra")).toContain("bold");
    expect(marks("A1")).not.toContain("bold");
    expect(marks("Kutu")).not.toContain("bold");
    ed.commands.undo();
    expect(marks("Önce")).not.toContain("bold");
  });

  it("renk ve hizalama tablo dışına uygulanır; tablo içinde uygulanacak yer yok", () => {
    const { ed } = kur();
    ed.commands.selectAll();
    expect(yaziRengi(ed, "#C00000")).toBe(true);
    expect(ed.state.doc.nodeAt(konum(ed, "A1"))!.marks.length).toBe(0);
    expect(hizala(ed, "center")).toBeGreaterThan(0);
    const para = (metin: string) => ed.state.doc.resolve(konum(ed, metin)).parent;
    expect(para("Sonra").attrs.textAlign).toBe("center");
    expect(para("A1").attrs.textAlign ?? null).not.toBe("center");
    ed.commands.setTextSelection(konum(ed, "B1") + 1);
    expect(aralikta(ed, (c) => c.setBold())).toBe(false);
    expect(hizala(ed, "right")).toBe(0);
  });

  it("stil uygulama: Başlık 1 başlık düğümüne çevirir", () => {
    const { ed } = kur();
    const styles = resolveStyles("default", "OfficeHere");
    ed.chain().setTextSelection(konum(ed, "Önce") + 1).run();
    expect(stilUygula(ed, styles, "Heading1")).toBe(true);
    const n = ed.state.doc.resolve(konum(ed, "Önce")).parent;
    expect(n.type.name).toBe("heading");
    expect(n.attrs.level).toBe(1);
    expect(stilUygula(ed, styles, "Quote")).toBe(true);
    expect(ed.state.doc.resolve(konum(ed, "Önce")).parent.attrs.styleId).toBe("Quote");
  });

  it("işlem seçimi değiştirmeden ilerler (TextSelection geri kurulur)", () => {
    const { ed } = kur();
    const a = konum(ed, "Önce");
    const b = konum(ed, "Sonra") + 3;
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, a, b)));
    isaretDegistir(ed, "italic", false);
    expect(ed.state.selection.from).toBe(a);
    expect(ed.state.selection.to).toBe(b);
  });
});

describe("yanlışlıkla silmeye karşı", () => {
  it("seçili resmin üzerine yazmak engellenir; silme tuşuyla silmek serbest", () => {
    const onEngel = vi.fn();
    const { ed } = kur(onEngel);
    const img = dugum(ed, "image");
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, img)));
    ed.commands.insertContent("yazı");
    expect(dugum(ed, "image")).toBe(img);
    expect(onEngel).toHaveBeenCalled();
    ed.commands.deleteSelection();
    expect(dugum(ed, "image")).toBe(-1);
  });
});

describe("işaret durumu", () => {
  it("tablo içeren seçimde kalın aç/kapat tutarlı çalışır", async () => {
    const { isaretEtkin } = await import("./komutlar");
    const { ed } = kur();
    ed.commands.selectAll();
    expect(isaretEtkin(ed, "bold")).toBe(false);
    isaretDegistir(ed, "bold", isaretEtkin(ed, "bold"));
    expect(isaretEtkin(ed, "bold")).toBe(true);
    isaretDegistir(ed, "bold", isaretEtkin(ed, "bold"));
    expect(isaretEtkin(ed, "bold")).toBe(false);
    expect(ed.state.doc.nodeAt(konum(ed, "Önce"))!.marks.length).toBe(0);
  });
});
