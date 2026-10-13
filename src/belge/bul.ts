// Bul ve Değiştir: masaüstü arama eklentisi (Türkçe harf katlaması, vurgular) üzerine; değiştirme
// korunan nesnelerin (tablo, metin kutusu) içindeki eşleşmeleri atlar.
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { adaptCase, findMatches, getSearch, gotoMatch, gotoMatchIndex, setSearch, type SearchMatch } from "@belge/editor/search";
import { kapsayiciIcinde } from "./koruma";

export { clearSearch, getSearch, gotoMatch, gotoMatchIndex, setSearch } from "@belge/editor/search";

/** Eşleşme korunan bir kapsayıcının içinde mi. */
export function korunanEslesme(view: EditorView, m: SearchMatch): boolean {
  return kapsayiciIcinde(view.state.doc.resolve(m.from));
}

/** Aramayı başlatır ve imlece en yakın (sonraki) eşleşmeye gider. */
export function ara(view: EditorView, query: string): void {
  setSearch(view, { query });
  const st = getSearch(view.state);
  if (!st?.matches.length) return;
  const from = view.state.selection.from;
  const i = st.matches.findIndex((m) => m.from >= from);
  gotoMatchIndex(view, i < 0 ? 0 : i);
}

export function sonraki(view: EditorView, yon: 1 | -1): boolean {
  return gotoMatch(view, yon);
}

/** Seçili eşleşmeyi değiştirir ve sonrakine geçer; korunansa değiştirmeden geçer ("korumali" döner). */
export function degistir(view: EditorView, yeni: string): "tamam" | "korumali" | "yok" {
  const st = getSearch(view.state);
  if (!st?.matches.length) return "yok";
  const { from, to } = view.state.selection;
  const hit = st.matches.find((m) => m.from === from && m.to === to);
  if (!hit) {
    gotoMatch(view, 1);
    return "tamam";
  }
  if (korunanEslesme(view, hit)) {
    gotoMatch(view, 1);
    return "korumali";
  }
  const marks = view.state.doc.resolve(from).marksAcross(view.state.doc.resolve(to)) ?? undefined;
  const text = adaptCase(view.state.doc.textBetween(from, to), yeni, st.caseSensitive);
  const tr = view.state.tr;
  if (text) tr.replaceWith(from, to, view.state.schema.text(text, marks));
  else tr.delete(from, to);
  tr.setSelection(TextSelection.create(tr.doc, from + text.length));
  view.dispatch(tr);
  gotoMatch(view, 1);
  return "tamam";
}

/** Tümünü değiştir (tek geri alma adımı); değiştirilen ve atlanan (korunan) eşleşme sayısı. */
export function tumunuDegistir(view: EditorView, yeni: string): { n: number; atlanan: number } {
  const st = getSearch(view.state);
  if (!st?.query) return { n: 0, atlanan: 0 };
  const all = findMatches(view.state.doc, st);
  const ok = all.filter((m) => !korunanEslesme(view, m));
  if (!ok.length) return { n: 0, atlanan: all.length };
  const tr = view.state.tr;
  for (let i = ok.length - 1; i >= 0; i--) {
    const m = ok[i];
    const marks = tr.doc.resolve(m.from).marksAcross(tr.doc.resolve(m.to)) ?? undefined;
    const text = adaptCase(tr.doc.textBetween(m.from, m.to), yeni, st.caseSensitive);
    if (text) tr.replaceWith(m.from, m.to, view.state.schema.text(text, marks));
    else tr.delete(m.from, m.to);
  }
  view.dispatch(tr);
  return { n: ok.length, atlanan: all.length - ok.length };
}
