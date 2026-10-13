// Ekran başına masaüstü deposu ve eylemleri (geri al/yinele geçmişi dahil) ile slayt işlemleri.
import { Actions } from "@sunum/state/actions";
import { Store, type AppState } from "@sunum/state/store";
import { isTextEmpty } from "@sunum/model/textStyle";
import type { Presentation, Shape, SpShape } from "@sunum/model/types";

export interface Oturum {
  store: Store;
  a: Actions;
}

/** Masaüstü uygulama durumunun mobilde kullanılan başlangıcı (görünüm alanları varsayılan). */
export function baslangicDurumu(pres: Presentation, fileName: string): AppState {
  return {
    pres,
    slideIdx: 0,
    slideSel: pres.slides[0] ? [pres.slides[0].id] : [],
    sel: [],
    editing: null,
    fileName,
    fileRef: null,
    dirty: false,
    view: "normal",
    zoom: 100,
    fit: true,
    showNotes: true,
    notesHeight: 64,
    thumbWidth: 220,
    showRuler: false,
    showGrid: false,
    showGuides: false,
    pane: null,
    insert: null,
    focus: "canvas",
    cellSel: null,
    painter: null,
    spellcheck: true,
    cropId: null,
    ink: null,
    textTick: 0,
    ribbonTab: "home",
    collapsedSections: [],
    masterBase: null,
    message: null,
    colorMode: "color",
    proofLang: "tr-TR",
    pointEdit: null,
  };
}

export function yeniOturum(pres: Presentation, fileName: string): Oturum {
  const store = new Store(baslangicDurumu(pres, fileName));
  return { store, a: new Actions(store) };
}

/** Mobilde metni düzenlenebilen şekil: metin kutusu ya da metin yer tutucusu (resim/tablo yer tutucusu değil). */
export function duzenlenebilir(s: Shape | undefined): s is SpShape {
  if (!s || s.kind !== "sp" || !s.text) return false;
  if (s.ph) return s.ph.type !== "pic" && s.ph.type !== "tbl";
  return !!s.txBox;
}

/** Boş metin kutusu/yer tutucusu (dokununca doğrudan yazmaya geçilir). */
export function bosMetin(s: SpShape): boolean {
  return isTextEmpty(s.text);
}

/** Slaydı bir önceye (-1) ya da bir sonraya (+1) taşır; sınırdaysa false. */
export function slaytTasi(a: Actions, index: number, yon: -1 | 1): boolean {
  const slides = a.s.pres.slides;
  const sl = slides[index];
  const hedef = index + yon;
  if (!sl || hedef < 0 || hedef >= slides.length) return false;
  // moveSlidesTo, taşınan slaytlar çıkarılmadan önceki ekleme konumunu alır.
  a.goToSlide(index);
  a.moveSlidesTo([sl.id], yon < 0 ? hedef : hedef + 1);
  return true;
}

/** Slaydı çoğaltır (kopya hemen sonrasına eklenir ve seçilir). */
export function slaytCogalt(a: Actions, index: number) {
  const sl = a.s.pres.slides[index];
  if (sl) a.duplicateSlides([sl.id]);
}

export function slaytSil(a: Actions, index: number) {
  const sl = a.s.pres.slides[index];
  if (sl) a.deleteSlides([sl.id]);
}

export function slaytGizle(a: Actions, index: number) {
  const sl = a.s.pres.slides[index];
  if (sl) a.toggleHideSlides([sl.id]);
}

/** Verilen slayttan sonra seçilen düzende yeni slayt ekler. */
export function slaytEkle(a: Actions, layoutId: string | undefined, sonra = a.s.slideIdx) {
  if (a.s.pres.slides.length) a.goToSlide(sonra);
  a.newSlide(layoutId);
}
