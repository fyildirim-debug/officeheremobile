// "Kaldığın yerden devam": belge başına okunan yer (görünür alanın üstündeki belge konumu) ve imleç cihazda
// saklanır; aynı belge yeniden açılınca oraya gidilir. Belge cihazdaki konumuyla (yoksa ad ve boyutla) tanınır.
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import type { PaginationController } from "@belge/editor/pagination";
import type { OpenedDoc } from "../platform";
import { toast } from "../shell/feedback";
import { imleciKoy, konumUstu, ustKonum, ustteGoster } from "./gezinme";

export interface Konum {
  /** Görünür alanın üstündeki belge konumu ve ekrandaki yeri (kaydırma alanının üstüne uzaklığı, px). */
  ust: number;
  dy?: number;
  /** Kaydırma oranı (konum bulunamazsa yedek). */
  oran: number;
  anchor: number;
  head: number;
  /** Kaydedildiği zaman (en eskisi silinir). */
  t: number;
}

const ANAHTAR = "officehere.mobile.belge.konum";
/** Saklanan en çok belge sayısı. */
export const EN_COK = 40;

/** Belgenin kimliği: cihazdaki konumu; yoksa (tarayıcıda seçilen dosya) ad ve bayt sayısı. Yeni belgede yok. */
export function konumAnahtari(doc: Pick<OpenedDoc, "name" | "uri" | "data">): string | null {
  if (doc.uri) return doc.uri;
  return doc.data ? `${doc.name}|${doc.data.byteLength}` : null;
}

function hepsi(): Record<string, Konum> {
  try {
    const v = JSON.parse(localStorage.getItem(ANAHTAR) ?? "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Konum>) : {};
  } catch {
    return {};
  }
}

export function konumOku(anahtar: string): Konum | null {
  const k = hepsi()[anahtar];
  return k && Number.isFinite(k.ust) && Number.isFinite(k.head) ? k : null;
}

export function konumYaz(anahtar: string, k: Omit<Konum, "t">, simdi = Date.now()) {
  const tum = hepsi();
  tum[anahtar] = { ...k, t: simdi };
  const fazla = Object.keys(tum).length - EN_COK;
  if (fazla > 0) for (const [a] of Object.entries(tum).sort((x, y) => x[1].t - y[1].t).slice(0, fazla)) delete tum[a];
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(tum));
  } catch {
    // depolama dolu ya da kapalı: konum saklanmaz
  }
}

/** Başta sayılan bölge: buradan önce kalınmışsa geri getirmeye gerek yok (belge zaten başta açılır). */
const BASTA = 2;
/** Açılıştan sonra düzen yerleşirken (sayfalama, sığdırma) yerin yeniden hizalandığı süre. */
const HIZALAMA_MS = 4000;

/**
 * Okunan yeri ve imleci saklar (kaydırma ve seçim değişince, uygulama arka plana giderken, ekran kapanırken);
 * açılışta saklanmış yer varsa oraya gider. Sayfalama ilk saniyelerde düzeni değiştirirse yer yeniden
 * hizalanır; kullanıcı dokunur ya da kaydırırsa bırakılır.
 */
export function useKaldiginYer(editor: Editor, controller: PaginationController, sc: HTMLElement | null, anahtar: string | null) {
  const anahtarRef = useRef(anahtar);
  anahtarRef.current = anahtar;
  // "bekliyor": açılıştaki yer henüz uygulanmadı (bu arada saklanmaz); "hazir": geri getirme bitti ya da gereksiz.
  const durum = useRef<"ilk" | "bekliyor" | "hazir">("ilk");

  const sakla = () => {
    const a = anahtarRef.current;
    if (!a || !sc?.isConnected || durum.current !== "hazir" || editor.isDestroyed) return;
    const ust = ustKonum(editor, sc);
    const y = ust === null ? null : konumUstu(editor, ust);
    const { anchor, head } = editor.state.selection;
    const max = sc.scrollHeight - sc.clientHeight;
    konumYaz(a, { ust: ust ?? 0, dy: y === null ? undefined : Math.round(y - sc.getBoundingClientRect().top), oran: max > 0 ? sc.scrollTop / max : 0, anchor, head });
  };
  const saklaRef = useRef(sakla);
  saklaRef.current = sakla;

  // Geri getirme (belge açılınca bir kez)
  useEffect(() => {
    if (!sc || durum.current === "hazir" || editor.isDestroyed) return;
    const k = anahtar ? konumOku(anahtar) : null;
    if (!k || (k.ust <= BASTA && k.head <= BASTA)) {
      durum.current = "hazir";
      return;
    }
    durum.current = "bekliyor";
    const boyut = editor.state.doc.content.size;
    imleciKoy(editor, Math.min(k.anchor, boyut), Math.min(k.head, boyut));
    let birak = false;
    const git = () => {
      if (birak || editor.isDestroyed) return;
      const dy = Number.isFinite(k.dy) ? Math.max(-sc.clientHeight, Math.min(sc.clientHeight, k.dy!)) : undefined;
      if (!(k.ust > BASTA && k.ust < boyut && ustteGoster(editor, sc, k.ust, dy))) sc.scrollTop = k.oran * Math.max(0, sc.scrollHeight - sc.clientHeight);
      if (durum.current !== "hazir") toast("Kaldığınız yerden devam ediliyor.");
      durum.current = "hazir";
    };
    const kullanici = () => {
      birak = true;
    };
    const olaylar = ["touchstart", "wheel", "pointerdown", "keydown"] as const;
    olaylar.forEach((o) => sc.addEventListener(o, kullanici, { passive: true }));
    // Sayfalama ölçümü ve sığdırma ölçeği ilk karelerde yerleşir
    let kare = requestAnimationFrame(() => {
      git();
      kare = requestAnimationFrame(git);
    });
    const abone = controller.subscribe(() => requestAnimationFrame(git));
    const son = window.setTimeout(kullanici, HIZALAMA_MS);
    return () => {
      birak = true;
      cancelAnimationFrame(kare);
      window.clearTimeout(son);
      abone();
      olaylar.forEach((o) => sc.removeEventListener(o, kullanici));
      // StrictMode yeniden bağlaması: uygulanmadan sökülen geri getirme yeniden başlar
      if (durum.current === "bekliyor") durum.current = "ilk";
    };
  }, [editor, controller, sc, anahtar]);

  // Saklama: kaydırma ve imleç değişince (ertelenerek), arka plana giderken
  useEffect(() => {
    if (!sc) return;
    let t = 0;
    const simdi = () => {
      window.clearTimeout(t);
      saklaRef.current();
    };
    const ertele = () => {
      window.clearTimeout(t);
      t = window.setTimeout(simdi, 400);
    };
    const gizlenince = () => document.visibilityState === "hidden" && simdi();
    sc.addEventListener("scroll", ertele, { passive: true });
    editor.on("selectionUpdate", ertele);
    document.addEventListener("visibilitychange", gizlenince);
    window.addEventListener("pagehide", simdi);
    return () => {
      window.clearTimeout(t);
      sc.removeEventListener("scroll", ertele);
      editor.off("selectionUpdate", ertele);
      document.removeEventListener("visibilitychange", gizlenince);
      window.removeEventListener("pagehide", simdi);
    };
  }, [editor, sc]);

  // Ekran kapanırken (belge DOM'dan kalkmadan) son yer saklanır
  useLayoutEffect(() => () => saklaRef.current(), []);
}
