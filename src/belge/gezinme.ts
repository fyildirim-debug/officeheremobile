// Belgede gezinme: başlık listesi (masaüstü Gezinti bölmesinin başlıkları), başlığa / sayfaya / başa / sona
// atlama ve görünür alanın üstündeki belge konumu. Atlama düzenleyiciye odaklanmaz (klavye açılmaz).
import type { Editor } from "@tiptap/core";
import { Selection, TextSelection } from "@tiptap/pm/state";
import { collectHeadings } from "@belge/editor/commands";

export interface Baslik {
  level: number;
  text: string;
  pos: number;
}

/** Belgedeki başlıklar (Başlık 1-6 ve anahat düzeyli paragraflar). */
export function basliklar(editor: Editor): Baslik[] {
  return collectHeadings(editor.state.doc);
}

/** Konumdan önceki son başlığın sırası (yoksa -1). */
export function etkinBaslik(liste: Baslik[], pos: number): number {
  let lo = 0;
  let hi = liste.length - 1;
  let bulunan = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (liste[mid].pos <= pos) {
      bulunan = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return bulunan;
}

/** Atlamada hedefin kaydırma alanının üstünden uzaklığı (px). */
const PAY = 12;

/** Görünür alanın üstündeki belge konumu (kaldığın yer, etkin başlık). */
export function ustKonum(editor: Editor, sc: HTMLElement): number | null {
  if (editor.isDestroyed) return null;
  const r = sc.getBoundingClientRect();
  const body = sc.querySelector<HTMLElement>(".bl-body .ProseMirror")?.getBoundingClientRect();
  const x = body ? Math.min(Math.max(r.left + r.width / 2, body.left + 4), body.right - 4) : r.left + r.width / 2;
  // Sayfa aralığına ya da kenar boşluğuna denk gelirse biraz aşağısı denenir
  for (const dy of [PAY + 4, 40, 80, 140]) {
    const hit = editor.view.posAtCoords({ left: x, top: r.top + dy });
    if (hit) return hit.pos;
  }
  return null;
}

/** Konumun ekrandaki üst kenarı (blok düğümün konumuysa düğümün üstü). */
export function konumUstu(editor: Editor, pos: number): number | null {
  if (editor.isDestroyed) return null;
  const doc = editor.state.doc;
  const p = Math.max(0, Math.min(pos, doc.content.size));
  const node = editor.view.nodeDOM(p);
  if (node instanceof HTMLElement && doc.nodeAt(p)?.isBlock) return node.getBoundingClientRect().top;
  try {
    return editor.view.coordsAtPos(Math.min(p + 1, doc.content.size)).top;
  } catch {
    return null;
  }
}

/** Konumu kaydırma alanının üstünden `pay` px aşağıya getirir. */
export function ustteGoster(editor: Editor, sc: HTMLElement, pos: number, pay = PAY): boolean {
  const top = konumUstu(editor, pos);
  if (top === null) return false;
  sc.scrollTop += top - sc.getBoundingClientRect().top - pay;
  return true;
}

/** İmleci (odaklanmadan) konuma koyar; geri alma geçmişine girmez. */
export function imleciKoy(editor: Editor, anchor: number, head = anchor) {
  if (editor.isDestroyed) return;
  const doc = editor.state.doc;
  const k = (n: number) => doc.resolve(Math.max(0, Math.min(n, doc.content.size)));
  const sel = anchor === head ? Selection.near(k(anchor)) : TextSelection.between(k(anchor), k(head));
  editor.view.dispatch(editor.state.tr.setSelection(sel).setMeta("addToHistory", false));
}

/**
 * Başlığa (ya da herhangi bir konuma) atlar: imleç başlığın başına konur, başlık ekranın üstüne gelir.
 * Sayfalama ölçümü sonradan düzeni kaydırırsa bir sonraki karede yeniden hizalanır.
 */
export function konumaGit(editor: Editor, sc: HTMLElement, pos: number) {
  imleciKoy(editor, Math.min(pos + 1, editor.state.doc.content.size));
  ustteGoster(editor, sc, pos);
  requestAnimationFrame(() => ustteGoster(editor, sc, pos));
}

/** Sayfa düzeninde n. sayfaya (0 tabanlı) atlar; imleç sayfanın ilk konumuna. */
export function sayfayaGit(editor: Editor, sc: HTMLElement, n: number, sayfaBaslari: number[]): boolean {
  const el = sc.querySelector<HTMLElement>(`.bl-page[data-page="${n}"]`);
  if (!el) return false;
  const pos = sayfaBaslari[n];
  if (pos !== undefined) imleciKoy(editor, pos);
  const hizala = () => {
    const sayfa = sc.querySelector<HTMLElement>(`.bl-page[data-page="${n}"]`);
    if (sayfa) sc.scrollTop += sayfa.getBoundingClientRect().top - sc.getBoundingClientRect().top - PAY;
  };
  hizala();
  requestAnimationFrame(hizala);
  return true;
}

/** Belgenin başına ya da sonuna gider. */
export function uca(editor: Editor, sc: HTMLElement, son: boolean) {
  const doc = editor.state.doc;
  const sel = son ? Selection.atEnd(doc) : Selection.atStart(doc);
  editor.view.dispatch(editor.state.tr.setSelection(sel).setMeta("addToHistory", false));
  sc.scrollTop = son ? sc.scrollHeight : 0;
}
