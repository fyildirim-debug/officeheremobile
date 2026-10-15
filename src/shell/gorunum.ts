// Görünüm durumu: ekranın kaldığı yer (kaydırma, imleç/seçim). Arka plana geçişte alınır, süreç
// sonlanmasından sonra belge yeniden açılınca uygulanır (platform/taslak.ts oturum kaydı).
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { AppKind } from "../platform";
import type { Gorunum } from "../platform/taslak";

/** "bekle": ekran (belge) henüz hazır değil; "uygulandi": durum şimdi verildi (ilk kez ya da içerik yeniden kurulduğu için); "hazir": verilmişti. */
export type VerSonucu = "bekle" | "uygulandi" | "hazir";

export interface GorunumKaynagi {
  /** Anlık durum; ekran hazır değilse undefined. */
  al(): Gorunum | undefined;
  /** Durumu uygular; her karede yinelenebilir olmalı (kullanıcının sonraki seçimini ezmeden). */
  ver(g: Gorunum): VerSonucu;
}

const sayi = (v: unknown, yedek = 0) => (typeof v === "number" && Number.isFinite(v) ? v : yedek);
const ikili = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 ? [sayi(v[0]), sayi(v[1])] : null);

type EditorOgesi = HTMLElement & { editor?: Editor };

/** Belge ekranının düzenleyicisi ve kaydırma kutusu (tiptap her düzenleyiciyi kök öğesine bağlar: dom.editor). */
function belgeOgeleri(): { ed: Editor; sc: HTMLElement } | null {
  const el = document.querySelector<EditorOgesi>(".m-belge-main .ProseMirror");
  const ed = el?.editor;
  const sc = el?.closest<HTMLElement>(".bl-scroll");
  return ed && !ed.isDestroyed && sc ? { ed, sc } : null;
}

/** İmlecin kaydırma kutusunun üstüne uzaklığı (görünürse). */
function imlecUstu(ed: Editor, sc: HTMLElement, pos: number): number | undefined {
  try {
    const y = ed.view.coordsAtPos(pos).top - sc.getBoundingClientRect().top;
    return y >= 0 && y <= sc.clientHeight ? y : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Belge: seçim (anchor/head) ve kaydırma. İmleç ekrandaysa geri gelince aynı yüksekliğe getirilir
 * (yakınlaştırma ya da sayfa düzeni biraz değişse de); değilse kaydırma konumu aynen uygulanır.
 * İkisi de içerik başına bir kez verilir (ekran içeriği yeniden kurarsa — StrictMode, ikinci yükleme —
 * yeniden). Sonraki karelerde kaydırma yalnız düzen henüz yerleşmediği için kırpıldıysa yenilenir;
 * kullanıcı ya da ekranın kendi "kaldığın yerden devam"ı (belge/konum.ts) kaydırdıysa dokunulmaz.
 */
export function belgeGorunumu(bul: () => { ed: Editor; sc: HTMLElement } | null = belgeOgeleri): GorunumKaynagi {
  const verilen = new WeakMap<Editor, { doc: PMNode; hedef: number; son: number | null }>();
  return {
    al() {
      const o = bul();
      if (!o) return undefined;
      const { anchor, head } = o.ed.state.selection;
      return { secim: [anchor, head], kaydirma: [o.sc.scrollLeft, o.sc.scrollTop], imlec: imlecUstu(o.ed, o.sc, head) };
    },
    ver(g) {
      const o = bul();
      if (!o) return "bekle";
      const { ed, sc } = o;
      const k = ikili(g.kaydirma);
      const d = verilen.get(ed);
      if (d && d.doc === ed.state.doc) {
        if (d.son !== null) {
          if (Math.abs(sc.scrollTop - d.son) > 1) d.son = null;
          else if (sc.scrollTop < d.hedef - 1) {
            sc.scrollTop = d.hedef;
            d.son = sc.scrollTop;
          }
        }
        return "hazir";
      }
      const secim = ikili(g.secim);
      if (secim) {
        const doc = ed.state.doc;
        const sinir = (p: number) => Math.max(0, Math.min(doc.content.size, Math.round(p)));
        try {
          ed.view.dispatch(ed.state.tr.setSelection(TextSelection.between(doc.resolve(sinir(secim[0])), doc.resolve(sinir(secim[1])))));
        } catch {
          // Belge değiştiyse seçim uygulanamaz; kaydırma yine uygulanır.
        }
      }
      let hedef = sc.scrollTop;
      if (k) {
        sc.scrollLeft = k[0];
        sc.scrollTop = hedef = k[1];
      }
      const imlec = typeof g.imlec === "number" ? g.imlec : undefined;
      const simdi = imlec === undefined ? undefined : imlecUstu(ed, sc, ed.state.selection.head);
      if (imlec !== undefined && simdi !== undefined) sc.scrollTop = hedef += simdi - imlec;
      verilen.set(ed, { doc: ed.state.doc, hedef, son: k ? sc.scrollTop : null });
      return "uygulandi";
    },
  };
}

/** Uygulamanın varsayılan görünüm kaynağı (ekran kendi kaynağını vermediyse). */
export function varsayilanGorunum(app: AppKind): GorunumKaynagi | undefined {
  return app === "belge" ? belgeGorunumu() : undefined;
}

/** Son uygulamadan sonra bu süre boyunca yinelenir (sayfa düzeni otursun; içerik yeniden kurulursa yeniden verilir). */
export const OTURMA_MS = 1500;
/** Bu süreden sonra (ekran hiç hazır olmasa da) bırakılır. */
export const HAZIRLIK_MS = 15_000;

/**
 * Görünüm durumunu ekran hazır olunca uygular: her karede dener; son uygulamadan sonra OTURMA_MS boyunca
 * yineler. Kullanıcı dokunur, kaydırır ya da yazarsa hemen bırakır. Döner: iptal işlevi.
 */
export function gorunumUygula(kaynak: () => GorunumKaynagi | undefined, g: Gorunum, bitti: () => void, saat: () => number = () => performance.now()): () => void {
  const t0 = saat();
  let son: number | null = null;
  let kare = 0;
  let durdu = false;
  const olaylar = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  const dur = () => {
    if (durdu) return;
    durdu = true;
    cancelAnimationFrame(kare);
    for (const o of olaylar) window.removeEventListener(o, kullanici, true);
    bitti();
  };
  const kullanici = () => dur();
  for (const o of olaylar) window.addEventListener(o, kullanici, true);
  const dene = () => {
    if (durdu) return;
    const t = saat();
    let r: VerSonucu = "bekle";
    try {
      r = kaynak()?.ver(g) ?? "bekle";
    } catch {
      r = "bekle";
    }
    if (r === "uygulandi" || (r === "hazir" && son === null)) son = t;
    if ((son !== null && t - son >= OTURMA_MS) || t - t0 >= HAZIRLIK_MS) {
      dur();
      return;
    }
    kare = requestAnimationFrame(dene);
  };
  dene();
  return () => {
    if (durdu) return;
    durdu = true;
    cancelAnimationFrame(kare);
    for (const o of olaylar) window.removeEventListener(o, kullanici, true);
  };
}
