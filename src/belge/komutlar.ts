// Mobil biçimlendirme komutları: masaüstü komutlarının karşılığı, ama (1) düzenleyiciye odaklanmaz
// (panel açıkken klavye açılmasın) ve (2) seçimdeki tablo/metin kutusu içini atlar (nesneler yalnız görüntülenir).
import type { ChainedCommands, Editor } from "@tiptap/core";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";
import { AllSelection, Selection, SelectionRange, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { Mapping } from "@tiptap/pm/transform";
import { FONT_SIZES } from "@officehere/core";
import { PARA_DEFAULTS, PARA_TYPES } from "@belge/editor/paragraphFormat";
import { INDENT_STEP, effectiveFontSize } from "@belge/editor/commands";
import { applyListAcross } from "@belge/editor/listApply";
import { syncDomSelection } from "@belge/editor/pagination";
import { effectiveProps, type StyleDef } from "@belge/model/styles";
import { MARGIN_PRESETS, PAGE_SIZE_LIST, type PageSetup } from "@belge/model/document";
import { computeFormat, type FormatState } from "@belge/editor/formatState";
import { KAPSAYICI, guvenliAraliklar, secimKorumali } from "./koruma";

/** Birden çok aralıklı seçim: tiptap işaret komutları her aralığa ayrı uygulanır (kapsayıcılar atlanır). */
class AralikSecimi extends Selection {
  constructor($anchor: ResolvedPos, $head: ResolvedPos, ranges: SelectionRange[]) {
    super($anchor, $head, ranges);
  }
  map(doc: PMNode, mapping: Mapping): Selection {
    return TextSelection.between(doc.resolve(mapping.map(this.anchor)), doc.resolve(mapping.map(this.head)));
  }
  eq(other: Selection): boolean {
    return other instanceof AralikSecimi && other.anchor === this.anchor && other.head === this.head;
  }
  toJSON() {
    return { type: "text", anchor: this.anchor, head: this.head };
  }
}

/** Tarayıcının henüz işlenmemiş seçim değişikliği okunur (ör. Shift+Home'dan hemen sonra düğme). */
export function secimiEsitle(editor: Editor) {
  if (!editor.isDestroyed && editor.view.hasFocus()) syncDomSelection(editor.view);
}

function aralikSecimi(doc: PMNode, araliklar: { from: number; to: number }[]): Selection {
  const ranges = araliklar.map((r) => new SelectionRange(doc.resolve(r.from), doc.resolve(r.to)));
  return new AralikSecimi(ranges[0].$from, ranges[ranges.length - 1].$to, ranges);
}

/**
 * İşaret (karakter biçimi) komutunu seçimin düzenlenebilir parçalarına uygular; tek işlem, tek geri alma adımı.
 * Uygulanacak yer yoksa (seçim tamamen tablo içinde) false.
 */
export function aralikta(editor: Editor, cmd: (c: ChainedCommands) => ChainedCommands): boolean {
  secimiEsitle(editor);
  const { state } = editor;
  if (secimKorumali(state)) return false;
  const sel = state.selection;
  if (sel.empty) return cmd(editor.chain()).run();
  const parcalar = guvenliAraliklar(state.doc, sel.from, sel.to);
  if (!parcalar.length) return false;
  if (parcalar.length === 1 && parcalar[0].from === sel.from && parcalar[0].to === sel.to && !(sel instanceof AllSelection)) return cmd(editor.chain()).run();
  const geri = (tr: Transaction) => (sel instanceof AllSelection ? new AllSelection(tr.doc) : TextSelection.between(tr.doc.resolve(tr.mapping.map(sel.anchor)), tr.doc.resolve(tr.mapping.map(sel.head))));
  return cmd(
    editor.chain().command(({ tr }) => {
      tr.setSelection(aralikSecimi(tr.doc, parcalar));
      return true;
    }),
  )
    .command(({ tr }) => {
      tr.setSelection(geri(tr));
      return true;
    })
    .run();
}

export type IsaretTuru = "bold" | "italic" | "underline" | "strike" | "subscript" | "superscript";

/** İşaret seçimin düzenlenebilir metninin tamamında var mı (tablo/kutu içi sayılmaz). */
export function isaretEtkin(editor: Editor, tur: IsaretTuru, esitle = true): boolean {
  if (esitle) secimiEsitle(editor);
  const { state } = editor;
  const sel = state.selection;
  if (sel.empty) return editor.isActive(tur);
  const type = state.schema.marks[tur];
  if (!type) return false;
  let metin = false;
  let hepsi = true;
  for (const r of guvenliAraliklar(state.doc, sel.from, sel.to)) {
    state.doc.nodesBetween(r.from, r.to, (n) => {
      if (n.isText) {
        metin = true;
        if (!type.isInSet(n.marks)) hepsi = false;
      }
      return hepsi;
    });
  }
  return metin && hepsi;
}

/** Masaüstü biçim durumu; tablo içeren seçimde karakter biçimleri yalnız düzenlenebilir metne göre. */
export function bicimDurumu(editor: Editor, styles: Record<string, StyleDef>): FormatState {
  const f = computeFormat(editor, styles);
  const { selection, doc } = editor.state;
  if (selection.empty || guvenliAraliklar(doc, selection.from, selection.to).length === 1) return f;
  const u = isaretEtkin(editor, "underline", false);
  return { ...f, bold: isaretEtkin(editor, "bold", false), italic: isaretEtkin(editor, "italic", false), strike: isaretEtkin(editor, "strike", false), underline: u ? (f.underline ?? "single") : null };
}

/** Kalın/italik/altı çizili/üstü çizili: seçimin durumuna göre ayarla ya da kaldır (aralıklarda tutarlı). */
export function isaretDegistir(editor: Editor, tur: IsaretTuru, acik: boolean): boolean {
  return aralikta(editor, (c) => (acik ? c.unsetMark(tur) : c.setMark(tur)));
}

export function yaziRengi(editor: Editor, renk: string | null): boolean {
  return aralikta(editor, (c) => (renk ? c.setColor(renk) : c.setMark("textStyle", { color: null }).command(bosYaziStiliniKaldir)));
}

/** Tüm öznitelikleri boşalan yazı stili işareti kaldırılır (masaüstü unsetColor gibi; yalnız seçim aralıklarında). */
function bosYaziStiliniKaldir({ tr }: { tr: Transaction }): boolean {
  const type = tr.doc.type.schema.marks.textStyle;
  if (!type) return true;
  for (const r of tr.selection.ranges) {
    const from = r.$from.pos;
    const to = r.$to.pos;
    tr.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return true;
      if (node.marks.some((m) => m.type === type && Object.values(m.attrs).every((v) => v == null))) tr.removeMark(Math.max(pos, from), Math.min(pos + node.nodeSize, to), type);
      return false;
    });
  }
  return true;
}

export function vurguRengi(editor: Editor, renk: string | null): boolean {
  return aralikta(editor, (c) => (renk ? c.setHighlight({ color: renk }) : c.unsetHighlight()));
}

export function yaziTipi(editor: Editor, ad: string): boolean {
  return aralikta(editor, (c) => c.setFontFamily(ad));
}

export function yaziBoyutu(editor: Editor, pt: number): boolean {
  const v = Math.max(1, Math.min(1638, Math.round(pt * 2) / 2));
  return aralikta(editor, (c) => c.setFontSize(`${v}pt`));
}

/** Yazı tipini büyült/küçült (masaüstündeki gibi listedeki sonraki boyut). */
export function boyutAdim(editor: Editor, styles: Record<string, StyleDef>, yon: 1 | -1): boolean {
  const cur = effectiveFontSize(editor, styles);
  const next = yon > 0 ? (FONT_SIZES.find((s) => s > cur + 0.01) ?? Math.ceil((cur + 10) / 10) * 10) : ([...FONT_SIZES].reverse().find((s) => s < cur - 0.01) ?? Math.max(1, cur - 1));
  return yaziBoyutu(editor, next);
}

/** Seçimdeki paragraflara (kapsayıcılar dışında) tek işlemle uygular; değişen paragraf sayısını döner. */
export function paragraflarda(editor: Editor, fn: (node: PMNode, pos: number, tr: Transaction) => void, ek?: (tr: Transaction) => void): number {
  secimiEsitle(editor);
  const { state, view } = editor;
  if (secimKorumali(state)) return 0;
  const { from, to } = state.selection;
  const tr = state.tr;
  let n = 0;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (KAPSAYICI.has(node.type.name)) return false;
    if (!PARA_TYPES.includes(node.type.name)) return true;
    fn(node, pos, tr);
    n++;
    return false;
  });
  ek?.(tr);
  if (n || tr.docChanged || tr.storedMarksSet) view.dispatch(tr);
  return n;
}

export type Hiza = "left" | "center" | "right" | "justify";

export function hizala(editor: Editor, a: Hiza): number {
  return paragraflarda(editor, (node, pos, tr) => tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: a }));
}

/** Paragraf stili (Başlık n → başlık düğümü); karakter stili işaret olarak uygulanır. */
export function stilUygula(editor: Editor, styles: Record<string, StyleDef>, id: string): boolean {
  secimiEsitle(editor);
  const def = styles[id];
  if (!def) return false;
  if (def.type === "character") {
    const etkin = editor.isActive("charStyle", { styleId: id });
    return aralikta(editor, (c) => (etkin ? c.unsetCharStyle() : c.setCharStyle(id)));
  }
  const { schema } = editor.state;
  return (
    paragraflarda(editor, (node, pos, tr) => {
      const a = { ...node.attrs } as Record<string, unknown>;
      delete a.level;
      a.styleId = null;
      if (def.level) tr.setNodeMarkup(pos, schema.nodes.heading, { ...a, level: def.level });
      else tr.setNodeMarkup(pos, schema.nodes.paragraph, { ...a, styleId: id === "Normal" ? null : id });
    }) > 0
  );
}

/** Girinti artır/azalt: liste öğesinde düzey değişir, paragrafta 1,25 cm adım. */
export function girinti(editor: Editor, yon: 1 | -1): boolean {
  secimiEsitle(editor);
  if (secimKorumali(editor.state)) return false;
  if (editor.isActive("listItem")) return yon > 0 ? editor.chain().sinkListItem("listItem").run() : editor.chain().liftListItem("listItem").run();
  return (
    paragraflarda(editor, (node, pos, tr) => {
      const cur = (node.attrs.indentLeft as number | null) ?? 0;
      const next = yon > 0 ? Math.floor(cur / INDENT_STEP + 1.001) * INDENT_STEP : Math.max(0, Math.ceil(cur / INDENT_STEP - 1.001) * INDENT_STEP);
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, indentLeft: next ? +next.toFixed(2) : null });
    }) > 0
  );
}

export function satirAraligi(editor: Editor, v: number): number {
  return paragraflarda(editor, (node, pos, tr) => tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineRule: "auto", lineHeight: v }));
}

/** Paragraf öncesi ya da sonrası boşluk (nk, 0-1584; masaüstü Düzen > Aralık). */
export function paragrafBoslugu(editor: Editor, kenar: "spaceBefore" | "spaceAfter", nk: number): number {
  const v = Math.max(0, Math.min(1584, Math.round(nk * 10) / 10));
  return paragraflarda(editor, (node, pos, tr) => tr.setNodeMarkup(pos, undefined, { ...node.attrs, [kenar]: v }));
}

/** İmleçteki paragrafın etkin boşlukları: kendi değeri yoksa stilinki. */
export function paragrafBosluklari(fmt: Pick<FormatState, "spaceBefore" | "spaceAfter" | "styleId">, styles: Record<string, StyleDef>): { once: number; sonra: number } {
  const p = styles[fmt.styleId] ? effectiveProps(styles, fmt.styleId) : {};
  return { once: fmt.spaceBefore ?? p.spaceBefore ?? 0, sonra: fmt.spaceAfter ?? p.spaceAfter ?? 0 };
}

/* ---------------- Sayfa yapısı (masaüstü Düzen sekmesi) ---------------- */

/** Kâğıt boyutu (yönlendirme korunur). */
export function kagitBoyutu(p: PageSetup, id: string): PageSetup {
  const s = PAGE_SIZE_LIST.find((x) => x.id === id);
  if (!s) return p;
  return p.orientation === "landscape" ? { ...p, width: s.h, height: s.w } : { ...p, width: s.w, height: s.h };
}

export function yonlendirme(p: PageSetup, o: "portrait" | "landscape"): PageSetup {
  return p.orientation === o ? p : { ...p, orientation: o, width: p.height, height: p.width };
}

/** Kenar boşluğu önayarı (Normal, Dar, Orta, Geniş). */
export function kenarBosluklari(p: PageSetup, id: string): PageSetup {
  const m = MARGIN_PRESETS.find((x) => x.id === id);
  return m ? { ...p, margin: { ...p.margin, ...m.m } } : p;
}

/** Tüm biçimlendirmeyi temizle: karakter biçimleri kalkar, paragraflar Normal olur (masaüstüyle aynı kural). */
export function bicimiTemizle(editor: Editor): boolean {
  secimiEsitle(editor);
  const { state } = editor;
  if (secimKorumali(state)) return false;
  const { from, to, empty } = state.selection;
  const koru = new Set(["link", "comment", "insertion", "deletion", "formatChange", "highlight"]);
  const parcalar = empty ? [] : guvenliAraliklar(state.doc, from, to);
  paragraflarda(
    editor,
    (_node, pos, tr) => tr.setNodeMarkup(pos, state.schema.nodes.paragraph, { ...PARA_DEFAULTS, textAlign: null }),
    (tr) => {
      for (const r of parcalar) for (const mt of Object.values(state.schema.marks)) if (!koru.has(mt.name)) tr.removeMark(r.from, r.to, mt);
      if (empty) tr.setStoredMarks([]);
    },
  );
  return true;
}

/** Bölüm bölüm uygula (masaüstü sectionWise; odaklanmadan). */
function bolumBolum(editor: Editor, apply: (c: ChainedCommands) => ChainedCommands): boolean {
  const sel = editor.state.selection;
  const all = sel instanceof AllSelection;
  const count = editor.state.doc.childCount;
  const first = sel.$from.depth ? sel.$from.index(0) : 0;
  const last = Math.min(count - 1, sel.$to.depth ? sel.$to.index(0) : count - 1);
  if (!all && first === last) return apply(editor.chain()).run();
  const size = editor.state.doc.content.size;
  let c = editor.chain();
  for (let i = last; i >= first; i--) {
    c = c.command(({ tr }) => {
      let start = 0;
      for (let k = 0; k < i; k++) start += tr.doc.child(k).nodeSize;
      const end = start + tr.doc.child(i).nodeSize;
      const from = i === first ? Math.max(sel.from, start + 1) : start + 1;
      const to = i === last ? Math.min(sel.to + (end - (start + editor.state.doc.child(i).nodeSize)), end - 1) : end - 1;
      tr.setSelection(TextSelection.between(tr.doc.resolve(from), tr.doc.resolve(Math.max(from, to))));
      return true;
    });
    c = apply(c);
  }
  c = c.command(({ tr }) => {
    const doc = tr.doc;
    tr.setSelection(all ? new AllSelection(doc) : TextSelection.between(doc.resolve(Math.min(sel.from, doc.content.size)), doc.resolve(Math.max(0, doc.content.size - (size - sel.to)))));
    return true;
  });
  return c.run();
}

/** Madde işaretli / numaralı liste aç-kapat (masaüstü toggleList davranışı). */
export function liste(editor: Editor, tur: "bulletList" | "orderedList"): boolean {
  secimiEsitle(editor);
  if (secimKorumali(editor.state)) return false;
  const nodeType = editor.schema.nodes[tur];
  return bolumBolum(editor, (c) => c.command(({ tr, commands }) => applyListAcross(tr, nodeType) || (tur === "bulletList" ? commands.toggleBulletList() : commands.toggleOrderedList())));
}
