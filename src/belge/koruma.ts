// Mobilde nesne koruması: tablolar, metin kutuları, resimler, grafikler ve denklemler yalnız görüntülenir.
// İçlerine yazılamaz, boyutları/konumları değişmez, yenileri eklenmez; bütün olarak silinmeleri serbesttir
// (geri alınabilir). Koruma iki katmanlıdır: kapsayıcılar DOM'da contenteditable=false çizilir (tarayıcı ve
// klavye içlerine yazamaz) ve belgeyi değiştiren her işlem filterTransaction ile denetlenir.
import { Extension } from "@tiptap/core";
import type { Node as PMNode, ResolvedPos, Slice } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Selection, type Transaction } from "@tiptap/pm/state";
import { AddMarkStep, AddNodeMarkStep, AttrStep, RemoveMarkStep, RemoveNodeMarkStep, ReplaceAroundStep, ReplaceStep, type Step } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { isHistoryTransaction } from "@tiptap/pm/history";
import { fieldsKey } from "@belge/editor/fields";

/** İçeriği olan, içi düzenlenemeyen kapsayıcılar. */
export const KAPSAYICI = new Set(["table", "textBox"]);
/** Yalnız görüntülenen atom nesneler (SmartArt ve şekiller okuyucuda resim/metin kutusu olur). */
export const NESNE = new Set(["image", "chart", "equation"]);
/** Belgeye mobilde eklenemeyen düğümler (tablo parçaları dahil). */
const EKLENEMEZ = new Set([...KAPSAYICI, ...NESNE, "tableRow", "tableCell", "tableHeader"]);

export const NESNE_ADI: Record<string, string> = { table: "Tablo", textBox: "Metin kutusu", image: "Resim", chart: "Grafik", equation: "Denklem" };

/** Tüm işlemlere izin veren işaret. */
export const IZIN = "belgeMobilIzin";

/** Belge yüklenirken (eklenen düzeltme işlemleri dahil) koruma devre dışı. */
export const korumaDurumu = { serbest: false };

export const korumaKey = new PluginKey<DecorationSet>("belgeMobilKoruma");

/** Konum bir kapsayıcının (tablo, metin kutusu) içinde mi. */
export function kapsayiciIcinde($pos: ResolvedPos): boolean {
  for (let d = $pos.depth; d > 0; d--) if (KAPSAYICI.has($pos.node(d).type.name)) return true;
  return false;
}

function dilimdeEklenemez(slice: Slice): boolean {
  let bulundu = false;
  slice.content.descendants((n) => {
    if (bulundu) return false;
    if (EKLENEMEZ.has(n.type.name)) bulundu = true;
    return !bulundu;
  });
  return bulundu;
}

/** Aralık bir kapsayıcıyla kesişiyor mu (biçim işaretleri için). */
function kapsayiciylaKesisir(doc: PMNode, from: number, to: number): boolean {
  if (kapsayiciIcinde(doc.resolve(from)) || kapsayiciIcinde(doc.resolve(to))) return true;
  let var_ = false;
  doc.nodesBetween(from, to, (n) => {
    if (var_) return false;
    if (KAPSAYICI.has(n.type.name)) var_ = true;
    return !var_ && !n.isTextblock;
  });
  return var_;
}

function korunanDugum(doc: PMNode, pos: number): boolean {
  const n = doc.nodeAt(pos);
  if (!n) return false;
  return EKLENEMEZ.has(n.type.name) || kapsayiciIcinde(doc.resolve(pos));
}

/** Tek adım korunan bir nesneyi değiştiriyor mu (adımdan önceki belgeye göre). */
export function adimKorunaniBozar(step: Step, doc: PMNode): boolean {
  if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
    const uclar = [step.from, step.to];
    if (step instanceof ReplaceAroundStep) uclar.push(step.gapFrom, step.gapTo);
    if (uclar.some((p) => kapsayiciIcinde(doc.resolve(p)))) return true;
    return dilimdeEklenemez(step.slice);
  }
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) return kapsayiciylaKesisir(doc, step.from, step.to);
  if (step instanceof AttrStep || step instanceof AddNodeMarkStep || step instanceof RemoveNodeMarkStep) return korunanDugum(doc, step.pos);
  return false;
}

/** İşleme izin verilir mi: seçim, sayfalama ve alan güncellemesi, geri alma serbest; nesne içi değişiklik yasak. */
export function islemeIzinVar(tr: Transaction): boolean {
  if (!tr.docChanged || tr.getMeta(IZIN) || korumaDurumu.serbest) return true;
  // Sürükle-bırak taşıması mobilde yok.
  if (tr.getMeta("uiEvent") === "drop") return false;
  if (isHistoryTransaction(tr) || tr.getMeta(fieldsKey)) return true;
  return !tr.steps.some((s, i) => adimKorunaniBozar(s, tr.docs[i]));
}

/** Seçili nesne (resim, tablo…) yazılan metinle değiştiriliyor mu. */
function nesneUzerineYazar(tr: Transaction, state: EditorState): boolean {
  const sel = state.selection;
  if (!(sel instanceof NodeSelection) || !(KAPSAYICI.has(sel.node.type.name) || NESNE.has(sel.node.type.name))) return false;
  if (isHistoryTransaction(tr) || tr.getMeta(IZIN) || korumaDurumu.serbest) return false;
  return tr.steps.some((s) => s instanceof ReplaceStep && s.from <= sel.from && s.to >= sel.to && s.slice.size > 0);
}

/** İşlemde bütün olarak silinen nesneler (bildirim için: "Tablo silindi"). */
export function silinenNesneler(trs: readonly Transaction[]): string[] {
  const out: string[] = [];
  for (const tr of trs) {
    if (isHistoryTransaction(tr)) continue;
    tr.steps.forEach((s, i) => {
      if (!(s instanceof ReplaceStep)) return;
      const { from, to } = s;
      if (to <= from) return;
      tr.docs[i].nodesBetween(from, to, (n, pos) => {
        if ((KAPSAYICI.has(n.type.name) || NESNE.has(n.type.name)) && pos >= from && pos + n.nodeSize <= to) {
          out.push(n.type.name);
          return false;
        }
        return true;
      });
    });
  }
  return out;
}

/** Seçim yalnız korunan içerikte mi (biçimlendirme uygulanacak yer yok). */
export function secimKorumali(state: EditorState): boolean {
  const sel = state.selection;
  if (sel instanceof NodeSelection && (KAPSAYICI.has(sel.node.type.name) || NESNE.has(sel.node.type.name))) return true;
  if (kapsayiciIcinde(sel.$from) && (sel.empty || kapsayiciIcinde(sel.$to))) {
    // Seçimin iki ucu aynı kapsayıcıdaysa düzenlenecek yer yok.
    return guvenliAraliklar(state.doc, sel.from, sel.to).length === 0;
  }
  return false;
}

/** [from, to] aralığının kapsayıcılar dışındaki parçaları. */
export function guvenliAraliklar(doc: PMNode, from: number, to: number): { from: number; to: number }[] {
  const engel: [number, number][] = [];
  doc.nodesBetween(from, to, (n, pos) => {
    if (KAPSAYICI.has(n.type.name)) {
      engel.push([pos, pos + n.nodeSize]);
      return false;
    }
    return !n.isTextblock;
  });
  const out: { from: number; to: number }[] = [];
  let cur = from;
  for (const [s, e] of engel) {
    if (s > cur) out.push({ from: cur, to: Math.min(s, to) });
    cur = Math.max(cur, e);
  }
  if (cur < to) out.push({ from: cur, to });
  return out.filter((r) => r.to > r.from);
}

function kapsayiciSusleri(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((n, pos) => {
    if (KAPSAYICI.has(n.type.name)) {
      decos.push(Decoration.node(pos, pos + n.nodeSize, { contenteditable: "false", "data-m-korumali": "" }));
      return false;
    }
    return !n.isTextblock;
  });
  return DecorationSet.create(doc, decos);
}

export interface KorumaSecenekleri {
  /** Kullanıcının engellenen bir düzenleme denemesi (bildirim için). */
  onEngel: () => void;
}

/** Mobil koruma eklentisi: masaüstü eklentilerinden önce çalışır (yapıştırma ve bırakma). */
export const MobilKoruma = Extension.create<KorumaSecenekleri>({
  name: "belgeMobilKoruma",
  priority: 1100,
  addOptions() {
    return { onEngel: () => {} };
  },
  addProseMirrorPlugins() {
    const opts = this.options;
    return [
      new Plugin<DecorationSet>({
        key: korumaKey,
        state: {
          init: (_c, state) => kapsayiciSusleri(state.doc),
          apply(tr, deco, _old, state) {
            if (!tr.docChanged) return deco;
            // Kapsayıcı yalnız yükleme ve geri almayla eklenebilir; o zaman baştan kurulur.
            if (tr.getMeta(IZIN) || korumaDurumu.serbest || isHistoryTransaction(tr)) return kapsayiciSusleri(state.doc);
            return deco.map(tr.mapping, tr.doc);
          },
        },
        filterTransaction(tr, state) {
          if (islemeIzinVar(tr)) {
            // Seçili nesnenin üzerine yazmak (yanlışlıkla silme) engellenir; silme tuşuyla silmek serbest.
            if (!tr.docChanged || !nesneUzerineYazar(tr, state)) return true;
            opts.onEngel();
            return false;
          }
          // Kullanıcı korunan bir nesnenin üzerindeyken (ya da yapıştırırken) bildirilir.
          const uzerinde = (sel: Selection) => kapsayiciIcinde(sel.$from) || kapsayiciIcinde(sel.$to) || (sel instanceof NodeSelection && NESNE.has(sel.node.type.name));
          if (tr.getMeta("uiEvent") || tr.getMeta("paste") || uzerinde(state.selection) || uzerinde(tr.selection)) opts.onEngel();
          return false;
        },
        props: {
          decorations: (state) => korumaKey.getState(state),
          // Tablo/metin kutusuna dokununca imleç oraya konur (yazılamaz); dışarıdaki metne kaymaz.
          handleClick(view, pos) {
            if (!view.editable) return false;
            const $p = view.state.doc.resolve(pos);
            if (!kapsayiciIcinde($p)) return false;
            view.dispatch(view.state.tr.setSelection(TextSelection.near($p)));
            return true;
          },
          // Tablo, resim vb. içeren pano içeriği düz metin olarak yapıştırılır.
          handlePaste(view, event, slice) {
            if (!dilimdeEklenemez(slice)) return false;
            if (kapsayiciIcinde(view.state.selection.$from)) {
              opts.onEngel();
              return true;
            }
            const text = event.clipboardData?.getData("text/plain") || slice.content.textBetween(0, slice.content.size, "\n\n", " ");
            if (text) view.pasteText(text);
            return true;
          },
          handleDrop: () => true,
          handleDOMEvents: {
            dragstart: (_view, e) => {
              e.preventDefault();
              return true;
            },
          },
        },
      }),
    ];
  },
});
