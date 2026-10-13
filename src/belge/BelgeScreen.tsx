// Belge ekranı: masaüstü Belge'nin düzenleyicisi, sayfalaması ve sayfa görünümü (DocumentView, koyu sayfa)
// üzerine dokunmatik kabuk. Açılışta görüntüleme kipi; kalemle düzenleme kipine geçilir.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useEditor, useEditorState } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { redoDepth, undoDepth } from "@tiptap/pm/history";
import { ArrowRedo24Regular, ArrowUndo24Regular, Dismiss20Regular, DocumentOnePage24Regular, Edit24Regular, MoreVertical24Regular, Phone24Regular, Save24Regular, Search24Regular } from "@fluentui/react-icons";
import { getUserName } from "@officehere/ui";
import { DocumentView } from "@belge/views/DocumentView";
import { PaginationController } from "@belge/editor/pagination";
import { editorExtensions } from "@belge/editor/extensions";
import { sameFormat } from "@belge/editor/formatState";
import { docStats } from "@belge/editor/commands";
import { annotateNotesHtml } from "@belge/editor/notes";
import { setTrackAuthorSource } from "@belge/editor/trackChanges";
import { PROTECTION_LABEL, isLocked } from "@belge/editor/protection";
import { fieldsKey } from "@belge/editor/fields";
import { bodyWidth, sectionGeoms } from "@belge/editor/sections";
import { defaultSettings, emptyDoc, normalizeDoc, type BelgeDocument, type DocSettings } from "@belge/model/document";
import { resolveStyles, styleSheetCss, themeByName, type StyleDef } from "@belge/model/styles";
import { openDocument, type FormatId } from "@belge/io";
import type { ViewOptions } from "@belge/state/context";
import { useProtection } from "@belge/state/useProtection";
import { useFieldSync } from "@belge/state/useFieldSync";
import "@belge/styles/workspace.css";
import "@belge/styles/document.css";
import "@belge/styles/document-marks.css";
import "@belge/styles/doc-extras.css";
import "@belge/styles/views.css";
import "@belge/styles/features.css";
import "@belge/styles/ui-extras.css";
import { AppBar, IconButton } from "../shell/AppBar";
import { useBackHandler } from "../shell/back";
import { confirmDialog, toast } from "../shell/feedback";
import { baseOf, type DocScreenProps } from "../platform";
import { MobilKoruma, NESNE_ADI, kapsayiciIcinde, korumaDurumu, silinenNesneler } from "./koruma";
import { bicimDurumu, bicimiTemizle, boyutAdim, girinti, hizala, isaretDegistir, isaretEtkin, satirAraligi, stilUygula, vurguRengi, yaziBoyutu, yaziRengi, yaziTipi } from "./komutlar";
import { farkliHedef, kayitHedefi, kodla, mimeOf } from "./kayit";
import { useGorunurAlan, useKistirma } from "./dokunma";
import { koyuNesneCss, sabitKoyuCss, zeminRenkleri } from "./koyuNesneler";
import { AracCubugu } from "./AracCubugu";
import { BulCubugu } from "./BulCubugu";
import { BICIM_PANELLERI, BilgiIcerik, FarkliKaydetIcerik, GorunumIcerik, MenuIcerik, Panel, ParagrafIcerik, RenkIcerik, StilIcerik, YaziTipiIcerik, type Bilgi, type PanelId } from "./Paneller";
import "./belge.css";

// Değişiklik izleme yazarı masaüstündeki gibi kullanıcı adı.
setTrackAuthorSource(getUserName);

interface Yuklenen {
  belge: BelgeDocument;
  format: FormatId;
  uyari?: string;
  yeni: boolean;
}

/** Ekran: belge ayrıştırılana dek yükleniyor görünümü, sonra düzenleyici. */
export default function BelgeScreen(props: DocScreenProps) {
  const { doc, onClose, dark } = props;
  const [yuk, setYuk] = useState<Yuklenen | null>(() => (doc.data ? null : { belge: { content: emptyDoc(), settings: defaultSettings() }, format: "docx", yeni: true }));
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    if (!doc.data) return;
    let iptal = false;
    openDocument(doc.name, doc.data).then(
      (r) => !iptal && setYuk({ belge: r.doc, format: r.format, uyari: r.warning, yeni: false }),
      (e: Error) => {
        if (iptal) return;
        setHata(`"${doc.name}" açılamadı: ${e.message}`);
        toast(`"${doc.name}" açılamadı.`, "error");
      },
    );
    return () => {
      iptal = true;
    };
  }, [doc]);

  // Koyu temada sayfa koyu çizilir (masaüstü "Koyu Sayfa"); ekrandan çıkınca öznitelik kalkar.
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.setAttribute("data-bl-page", "dark");
    else root.removeAttribute("data-bl-page");
    return () => root.removeAttribute("data-bl-page");
  }, [dark]);

  useBackHandler(onClose, !yuk);

  if (!yuk) {
    return (
      <div className="m-screen m-belge">
        <AppBar title={doc.name} subtitle="Belge" onBack={onClose} />
        <main className="m-content m-belge-bekle">{hata ? <p className="m-belge-hata">{hata}</p> : <span className="m-belge-donen" role="progressbar" aria-label="Açılıyor" />}</main>
      </div>
    );
  }
  return <BelgeDuzenleyici {...props} yuk={yuk} />;
}

const GORUNUM_KEY = "officehere.mobile.belge.gorunum";
type Mod = "print" | "web";

function okuGorunum(): Mod {
  try {
    return localStorage.getItem(GORUNUM_KEY) === "web" ? "web" : "print";
  } catch {
    return "print";
  }
}

/** Belgeden bağımsız koyu kurallar (dolgulu tablo stilleri, grafik). */
const SABIT_KOYU_CSS = sabitKoyuCss();

/** DocumentView tuval dolgusu (masaüstüyle aynı). */
const CANVAS_PAD = 20;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Kıstırma/düğme yakınlaştırmasında yerinde kalacak nokta. */
interface Capa {
  cx: number;
  cy: number;
  /** Sayfa düzeni: tuvaldeki nokta (ölçeksiz). */
  ux: number;
  uy: number;
  /** Mobil görünüm: belgedeki konum ve satırın odak noktasına uzaklığı (metin yeniden akar). */
  pos: number | null;
  dy: number;
  z0: number;
}

/**
 * Düzenleyiciyi kurar. tiptap düzenleyicisi ilk karede (StrictMode yeniden bağlamasında) kısa süre yok
 * olabilir; o arada yükleniyor görünümü çizilir, gövde hazır düzenleyiciyle bağlanır.
 */
function BelgeDuzenleyici(props: DocScreenProps & { yuk: Yuklenen }) {
  const [controller] = useState(() => new PaginationController());
  const stylesRef = useRef<Record<string, StyleDef>>(resolveStyles(props.yuk.belge.settings.styleSet, props.yuk.belge.settings.theme));
  const engelRef = useRef<() => void>(() => {});
  const editor = useEditor({
    extensions: [
      ...editorExtensions(controller, {
        styles: () => stylesRef.current,
        openDialog: () => {},
        toggleShowMarks: () => {},
        newComment: () => {},
        toggleTrack: () => {},
        insertNote: () => {},
      }),
      MobilKoruma.configure({ onEngel: () => engelRef.current() }),
    ],
    content: emptyDoc(),
    autofocus: false,
    editorProps: {
      attributes: { class: "bl-editor", spellcheck: "true", lang: "tr", autocapitalize: "sentences", "aria-label": "Belge gövdesi" },
    },
  }) as Editor | null;
  if (!editor || editor.isDestroyed) {
    return (
      <div className="m-screen m-belge">
        <AppBar title={props.doc.name} subtitle="Belge" onBack={props.onClose} />
        <main className="m-content m-belge-bekle">
          <span className="m-belge-donen" role="progressbar" aria-label="Açılıyor" />
        </main>
      </div>
    );
  }
  return <BelgeGovde key={editor.instanceId} {...props} editor={editor} controller={controller} stylesRef={stylesRef} engelRef={engelRef} />;
}

interface GovdeProps extends DocScreenProps {
  yuk: Yuklenen;
  editor: Editor;
  controller: PaginationController;
  stylesRef: React.MutableRefObject<Record<string, StyleDef>>;
  engelRef: React.MutableRefObject<() => void>;
}

function BelgeGovde({ doc, platform, onClose, dark, yuk, editor, controller, stylesRef, engelRef }: GovdeProps) {
  const [settings, setSettingsState] = useState<DocSettings>(yuk.belge.settings);
  const [duzenle, setDuzenle] = useState(yuk.yeni);
  const [ad, setAd] = useState(doc.name);
  const [format, setFormat] = useState<FormatId>(yuk.format);
  const [kirli, setKirli] = useState(false);
  const [kopyaVar, setKopyaVar] = useState(!yuk.yeni);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mod, setModState] = useState<Mod>(okuGorunum);
  const [sigdir, setSigdir] = useState(true);
  const [sayfaOlcek, setSayfaOlcek] = useState(1);
  const [webOlcek, setWebOlcek] = useState(1);
  const [fit, setFit] = useState(0.5);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [bul, setBul] = useState(false);
  const [not, setNot] = useState<string | null>(yuk.uyari ?? null);
  const [version, setVersion] = useState(0);
  const [bilgi, setBilgi] = useState<Bilgi | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const kirliRef = useRef(false);
  kirliRef.current = kirli;
  /** Son kaydedilen (ya da açılan) belge; kirli bayrak buna göre. */
  const tabanRef = useRef<PMNode | null>(null);
  const odakVardi = useRef(false);

  const styles = useMemo(
    () => resolveStyles(settings.styleSet, settings.theme, settings.fontTheme, settings.paragraphSpacing, settings.customStyles),
    [settings.styleSet, settings.theme, settings.fontTheme, settings.paragraphSpacing, settings.customStyles],
  );
  stylesRef.current = styles;

  // Korunan nesneye dokunma bildirimi (sık tekrarlanmaz).
  const sonEngel = useRef(0);
  const engel = useCallback(() => {
    const now = Date.now();
    if (now - sonEngel.current < 2500) return;
    sonEngel.current = now;
    toast("Tablolar, resimler ve diğer nesneler mobilde yalnız görüntülenir.");
  }, []);
  engelRef.current = engel;

  // Belge yüklenir (masaüstündeki gibi: içerik ve düzeltmeleri, sonra geri alma geçmişi sıfırlanır).
  useLayoutEffect(() => {
    if (editor.isDestroyed) return;
    korumaDurumu.serbest = true;
    try {
      editor.commands.setContent(normalizeDoc(yuk.belge.content as JSONContent), { emitUpdate: false });
    } finally {
      korumaDurumu.serbest = false;
    }
    const state = EditorState.create({ doc: editor.state.doc, plugins: editor.state.plugins, selection: TextSelection.atStart(editor.state.doc) });
    editor.view.updateState(state);
    editor.setEditable(yuk.yeni, false);
    tabanRef.current = editor.state.doc;
    if (import.meta.env.DEV) (window as unknown as { __belgeMobil: unknown }).__belgeMobil = { editor, controller };
    // Yeni belge düzenleme kipinde, imleç hazır.
    if (yuk.yeni) editor.view.focus();
  }, [editor, yuk, controller]);

  // Kirli bayrak: kayıtlı hâlle karşılaştırılır (geri alınca yeniden "Kaydedildi"); yalnız alan güncellemesi kirletmez.
  useEffect(() => {
    let t = 0;
    const on = ({ transaction, appendedTransactions }: { transaction: Transaction; appendedTransactions: Transaction[] }) => {
      const trs = [transaction, ...appendedTransactions];
      if (!kirliRef.current && trs.every((x) => !x.docChanged || x.getMeta(fieldsKey))) tabanRef.current = editor.state.doc;
      else setKirli(!tabanRef.current || !editor.state.doc.eq(tabanRef.current));
      const silinen = silinenNesneler(trs);
      if (silinen.length) toast(`${NESNE_ADI[silinen[0]] ?? "Nesne"} silindi. Geri almak için Geri al'a dokunun.`);
      window.clearTimeout(t);
      t = window.setTimeout(() => setVersion((v) => v + 1), 200);
    };
    editor.on("update", on);
    return () => {
      editor.off("update", on);
      window.clearTimeout(t);
    };
  }, [editor]);

  // Koyu Sayfa: belgedeki açık dolgular ve grafikler (yalnız ekranda; açık temada kural üretilmez).
  const [koyuCss, setKoyuCss] = useState("");
  useLayoutEffect(() => {
    if (!dark || editor.isDestroyed) return setKoyuCss("");
    setKoyuCss(`${SABIT_KOYU_CSS}\n${koyuNesneCss(zeminRenkleri(editor.state.doc, settings), styles)}`);
  }, [dark, version, settings, styles, editor]);

  const kilitli = isLocked(settings.protection);
  useProtection([editor], settings);
  useFieldSync(editor, controller, settings);

  useEffect(() => {
    if (!editor.isDestroyed && editor.isEditable !== (duzenle && !kilitli)) editor.setEditable(duzenle && !kilitli, false);
  }, [editor, duzenle, kilitli]);

  // Düzenleme kipinde tablo/nesne içine dokunulursa bilgi verilir.
  useEffect(() => {
    if (!duzenle) return;
    const on = () => {
      if (editor.isFocused && kapsayiciIcinde(editor.state.selection.$from)) engelRef.current();
    };
    editor.on("selectionUpdate", on);
    return () => void editor.off("selectionUpdate", on);
  }, [editor, duzenle]);

  const fmt =
    useEditorState({ editor, selector: ({ editor: ed }) => bicimDurumu(ed, stylesRef.current), equalityFn: (a, b) => !!a && !!b && sameFormat(a, b) }) ?? bicimDurumu(editor, styles);
  const gecmis = useEditorState({ editor, selector: ({ editor: ed }) => ({ u: undoDepth(ed.state) > 0, r: redoDepth(ed.state) > 0 }), equalityFn: (a, b) => !!a && !!b && a.u === b.u && a.r === b.r }) ?? {
    u: false,
    r: false,
  };

  /* ---------------- Görünüm ve yakınlaştırma ---------------- */

  const setMod = (m: Mod) => {
    setModState(m);
    try {
      localStorage.setItem(GORUNUM_KEY, m);
    } catch {
      // depolama kapalı: yalnız bu oturum
    }
  };

  const layoutBodyW = useSyncExternalStore(
    useCallback((cb: () => void) => controller.subscribe(cb), [controller]),
    () => controller.info.bodyW,
  );
  const bodyW = Math.max(layoutBodyW || 0, bodyWidth(sectionGeoms(editor.state.doc, settings.page)));

  useLayoutEffect(() => setScrollEl(scrollRef.current), []);

  // Sayfa genişliğine sığdırma ölçeği (döndürme ve pencere değişiminde yenilenir; ilk çizimden önce).
  useLayoutEffect(() => {
    if (!scrollEl) return;
    let h = scrollEl.clientHeight;
    const hesap = () => {
      const w = scrollEl.clientWidth;
      if (w > 0) setFit(clamp(w / (bodyW + 2 * CANVAS_PAD), 0.1, 3));
      // Klavye açılıp alan daralınca imleç görünür kalır.
      if (scrollEl.clientHeight < h && editor.isFocused) requestAnimationFrame(() => !editor.isDestroyed && editor.commands.scrollIntoView());
      h = scrollEl.clientHeight;
    };
    hesap();
    const ro = new ResizeObserver(hesap);
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, [scrollEl, bodyW, editor]);

  const sayfaMin = fit * 0.75;
  const olcek = mod === "print" ? (sigdir ? fit : clamp(sayfaOlcek, sayfaMin, 4)) : webOlcek;
  const olcekRef = useRef(olcek);
  olcekRef.current = olcek;
  const capaRef = useRef<Capa | null>(null);

  const capaAl = useCallback(
    (cx: number, cy: number): Capa | null => {
      const sc = scrollRef.current;
      const canvas = sc?.querySelector<HTMLElement>(".bl-canvas");
      if (!sc || !canvas) return null;
      const r = canvas.getBoundingClientRect();
      const z0 = olcekRef.current;
      let pos: number | null = null;
      let dy = 0;
      if (mod === "web") {
        pos = editor.view.posAtCoords({ left: cx, top: cy })?.pos ?? null;
        if (pos !== null) dy = editor.view.coordsAtPos(pos).top - cy;
      }
      return { cx, cy, ux: (cx - r.left) / z0, uy: (cy - r.top) / z0, pos, dy, z0 };
    },
    [editor, mod],
  );

  const olcekUygula = useCallback(
    (z: number, capa: Capa | null) => {
      if (mod === "web") {
        const v = clamp(Math.round(z * 100) / 100, 0.7, 2.5);
        capaRef.current = v !== olcekRef.current ? capa : null;
        setWebOlcek(v);
        return;
      }
      const v = clamp(z, sayfaMin, 4);
      // Sığdırmaya çok yakınsa sığdırma kipine döner (döndürmede yeniden hesaplansın).
      const sigar = Math.abs(v - fit) / fit < 0.03;
      capaRef.current = (sigar ? fit : v) !== olcekRef.current ? capa : null;
      if (sigar) setSigdir(true);
      else {
        setSigdir(false);
        setSayfaOlcek(v);
      }
    },
    [mod, sayfaMin, fit],
  );

  // Yakınlaştırma sonrası çapa noktası parmakların (ya da ekran ortasının) altında kalır.
  useLayoutEffect(() => {
    const c = capaRef.current;
    capaRef.current = null;
    const sc = scrollRef.current;
    const canvas = sc?.querySelector<HTMLElement>(".bl-canvas");
    if (!c || !sc || !canvas || editor.isDestroyed) return;
    if (mod === "web" && c.pos !== null) {
      try {
        const now = editor.view.coordsAtPos(Math.min(c.pos, editor.state.doc.content.size)).top;
        sc.scrollTop += now - (c.cy + (c.dy * olcek) / c.z0);
      } catch {
        // konum geçersiz
      }
      return;
    }
    const r = canvas.getBoundingClientRect();
    sc.scrollLeft += r.left + c.ux * olcek - c.cx;
    sc.scrollTop += r.top + c.uy * olcek - c.cy;
  }, [olcek, mod, editor]);

  const kistirma = useRef<Capa | null>(null);
  useKistirma(scrollEl, {
    start: (cx, cy) => {
      kistirma.current = capaAl(cx, cy);
      const sc = scrollRef.current;
      if (!sc) return;
      const sr = sc.getBoundingClientRect();
      sc.style.transformOrigin = `${cx - sr.left}px ${cy - sr.top}px`;
      sc.classList.add("is-pinching");
    },
    move: (r) => {
      const k = kistirma.current;
      const sc = scrollRef.current;
      if (!k || !sc) return;
      const lo = mod === "web" ? 0.7 : sayfaMin;
      const hi = mod === "web" ? 2.5 : 4;
      sc.style.transform = `scale(${clamp(k.z0 * r, lo, hi) / k.z0})`;
    },
    end: (r) => {
      const k = kistirma.current;
      kistirma.current = null;
      const sc = scrollRef.current;
      if (sc) {
        sc.style.transform = "";
        sc.classList.remove("is-pinching");
      }
      if (k && Math.abs(r - 1) > 0.02) olcekUygula(k.z0 * r, k);
    },
  });

  const dugmeYakinlastir = (yon: 1 | -1) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    const capa = capaAl(r.left + r.width / 2, r.top + r.height / 3);
    const adim = mod === "web" ? 0.1 : 0.25 * fit;
    olcekUygula(olcek + yon * adim, capa);
  };

  /* ---------------- Düzenleme kipi ---------------- */

  const duzenlemeyeGec = () => {
    if (kilitli) {
      toast("Bu belge düzenlemeye karşı korunuyor.");
      return;
    }
    // Klavye dokunuşla açılsın diye düzenlenebilirlik ve odak hemen (aynı dokunuşta) ayarlanır.
    editor.setEditable(true, false);
    const sel = editor.state.selection;
    const sc = scrollRef.current;
    let gorunur = false;
    try {
      const c = editor.view.coordsAtPos(sel.head);
      const r = sc?.getBoundingClientRect();
      gorunur = !!r && c.top >= r.top && c.bottom <= r.bottom;
    } catch {
      gorunur = false;
    }
    if (sc && !gorunur) {
      // İmleç okunan yerin başına konur (belgenin başına atlamaz).
      const r = sc.getBoundingClientRect();
      const hit = editor.view.posAtCoords({ left: r.left + r.width / 2, top: r.top + Math.min(48, r.height / 4) });
      if (hit) editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(hit.pos))));
    }
    editor.view.focus();
    setDuzenle(true);
  };

  const duzenlemeyiBitir = () => {
    setPanel(null);
    editor.setEditable(false, false);
    (editor.view.dom as HTMLElement).blur();
    setDuzenle(false);
  };

  /* ---------------- Paneller ---------------- */

  const panelKapat = useCallback(() => {
    const bicim = !!panel && BICIM_PANELLERI.includes(panel);
    setPanel(null);
    if (bicim && odakVardi.current && duzenle && !editor.isDestroyed) editor.view.focus();
    odakVardi.current = false;
  }, [panel, duzenle, editor]);

  const panelAc = (p: PanelId) => {
    if (panel === p) return panelKapat();
    // Biçim panelinde klavye kapanır; panel kapanınca yazmaya devam edilir.
    if (BICIM_PANELLERI.includes(p)) {
      if (!panel) odakVardi.current = editor.isFocused;
      if (editor.isFocused) (editor.view.dom as HTMLElement).blur();
    }
    if (p === "bilgi") {
      const s = docStats(editor.state.doc);
      setBilgi({ ad, bicim: format, sayfa: mod === "print" ? controller.info.pageCount : (controller.lastPaged?.count ?? controller.info.pageCount), ...s });
    }
    setPanel(p);
  };

  const bulAc = () => {
    setPanel(null);
    setBul(true);
  };

  /* ---------------- Kaydetme ve paylaşma ---------------- */

  const baytlar = useCallback(
    (f: FormatId, ad_: string) => kodla(f, { content: editor.getJSON(), settings }, { html: () => annotateNotesHtml(editor.getHTML()), title: baseOf(ad_) }),
    [editor, settings],
  );

  const kaydet = useCallback(
    async (hedefBicim?: FormatId): Promise<boolean> => {
      const t = hedefBicim ? farkliHedef(ad, hedefBicim) : kayitHedefi(ad, format);
      setKaydediliyor(true);
      try {
        const anlik = editor.state.doc;
        const bytes = await baytlar(t.format, t.name);
        // Farklı kaydette (Android'de) aynı ad olsa da konum sorulur.
        const saved = await platform.saveFile(t.name, bytes, mimeOf(t.format), hedefBicim ? { saveAs: true } : undefined);
        const yeniAd = saved.name || t.name;
        setAd(yeniAd);
        setFormat(t.format);
        tabanRef.current = anlik;
        setKirli(!editor.state.doc.eq(anlik));
        setKopyaVar(true);
        if (!hedefBicim && t.donustu && format === "doc") toast(`.doc biçimine yazılamadığı için "${yeniAd}" olarak kaydedildi; özgün dosya değişmedi.`, "success");
        else if (!hedefBicim && t.donustu) toast(`"${yeniAd}" olarak kaydedildi.`, "success");
        else toast(`"${yeniAd}" kaydedildi.`, "success");
        return true;
      } catch (err) {
        // Konum seçmekten vazgeçildi: hata değil, belge kirli kalır.
        if ((err as Error)?.name !== "AbortError") toast(`Kaydedilemedi: ${(err as Error).message}`, "error");
        return false;
      } finally {
        setKaydediliyor(false);
      }
    },
    [ad, format, editor, baytlar, platform],
  );

  const paylas = async () => {
    setPanel(null);
    const t = kayitHedefi(ad, format);
    try {
      await platform.shareFile(t.name, await baytlar(t.format, t.name), mimeOf(t.format));
    } catch (err) {
      toast(`Paylaşılamadı: ${(err as Error).message}`, "error");
    }
  };

  /* ---------------- Geri ---------------- */

  const soruAcik = useRef(false);
  const kapat = useCallback(async () => {
    if (!kirliRef.current) return onClose();
    if (soruAcik.current) return;
    soruAcik.current = true;
    const r = await confirmDialog({
      title: "Değişiklikler kaydedilsin mi?",
      message: `"${ad}" belgesinde kaydedilmemiş değişiklikler var.`,
      buttons: [
        { id: "save", label: "Kaydet" },
        { id: "discard", label: "Kaydetme", danger: true },
        { id: "cancel", label: "Vazgeç" },
      ],
    }).finally(() => (soruAcik.current = false));
    if (r === "save") {
      if (await kaydet()) onClose();
    } else if (r === "discard") onClose();
  }, [ad, kaydet, onClose]);

  // Android geri tuşu: önce panel, sonra bul çubuğu, sonra düzenleme kipi, en son ekran.
  useBackHandler(() => {
    if (panel) panelKapat();
    else if (bul) setBul(false);
    else if (duzenle) duzenlemeyiBitir();
    else void kapat();
  });

  /* ---------------- Görüntüleme kipinde bağlantılar ---------------- */

  const onTikla = (e: React.MouseEvent) => {
    if (duzenle) return;
    const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || !a.closest(".bl-body")) return;
    const href = a.getAttribute("href") ?? "";
    e.preventDefault();
    if (href.startsWith("#")) {
      const name = CSS.escape(decodeURIComponent(href.slice(1)));
      document.querySelector(`.bl-body [data-bookmark="${name}"], .bl-body [id="${name}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    } else if (/^(https?:|mailto:|tel:)/i.test(href)) window.open(href, "_blank", "noopener");
  };

  /* ---------------- Çizim ---------------- */

  const view: ViewOptions = {
    mode: mod,
    zoom: olcek * 100,
    ruler: false,
    gridlines: false,
    navPane: false,
    focusMode: false,
    showMarks: false,
    showComments: false,
    onePage: true,
    markup: "all",
    balloons: "inline",
  };
  const noop = useCallback(() => {}, []);
  const updateSettings = useCallback((fn: (s: DocSettings) => DocSettings) => setSettingsState((s) => fn(s)), []);
  const alan = useGorunurAlan();
  const kayitli = !kirli && kopyaVar;
  const altSatir = `Belge · ${kaydediliyor ? "Kaydediliyor…" : kayitli ? "Kaydedildi" : "Kaydedilmedi"}`;
  const ozelStiller = useMemo(() => Object.keys(settings.customStyles ?? {}), [settings.customStyles]);
  const tema = themeByName(settings.theme);
  const korumaNotu = settings.protection?.enforced ? `Belge korumalı: ${PROTECTION_LABEL[settings.protection.mode]}.` : null;

  const actions = duzenle ? (
    <>
      <IconButton label="Geri al" disabled={!gecmis.u} onClick={() => editor.chain().undo().run()}>
        <ArrowUndo24Regular />
      </IconButton>
      <IconButton label="Yinele" disabled={!gecmis.r} onClick={() => editor.chain().redo().run()}>
        <ArrowRedo24Regular />
      </IconButton>
      <IconButton label="Kaydet" disabled={kaydediliyor} onClick={() => void kaydet()}>
        <Save24Regular />
      </IconButton>
      <IconButton label="Daha fazla" onClick={() => panelAc("menu")}>
        <MoreVertical24Regular />
      </IconButton>
    </>
  ) : (
    <>
      <IconButton label={mod === "web" ? "Sayfa düzeni" : "Mobil görünüm"} onClick={() => setMod(mod === "web" ? "print" : "web")}>
        {mod === "web" ? <DocumentOnePage24Regular /> : <Phone24Regular />}
      </IconButton>
      <IconButton label="Bul" onClick={bulAc}>
        <Search24Regular />
      </IconButton>
      {(kirli || !kopyaVar) && (
        <IconButton label="Kaydet" disabled={kaydediliyor} onClick={() => void kaydet()}>
          <Save24Regular />
        </IconButton>
      )}
      <IconButton label="Düzenle" disabled={kilitli} onClick={duzenlemeyeGec}>
        <Edit24Regular />
      </IconButton>
      <IconButton label="Daha fazla" onClick={() => panelAc("menu")}>
        <MoreVertical24Regular />
      </IconButton>
    </>
  );

  return (
    <div
      className={`m-screen m-belge${duzenle ? " is-edit" : " is-view"}`}
      style={alan.h ? { height: alan.h, transform: `translateY(${alan.top}px)` } : undefined}
      onMouseDown={(e) => {
        // Geri al / Yinele / Kaydet dokunuşu odağı düzenleyiciden almaz (klavye kapanmaz).
        if (editor.isFocused && (e.target as HTMLElement).closest?.('.m-appbar button:is([aria-label="Geri al"], [aria-label="Yinele"], [aria-label="Kaydet"])')) e.preventDefault();
      }}
    >
      <style>{styleSheetCss(styles)}</style>
      {koyuCss && <style>{koyuCss}</style>}
      <AppBar title={ad} subtitle={altSatir} onBack={() => void kapat()} actions={actions} />
      {bul && <BulCubugu editor={editor} duzenle={duzenle} onClose={() => setBul(false)} />}
      {(not || korumaNotu) && (
        <div className="m-belge-not" role="status">
          <span>{korumaNotu ?? not}</span>
          {!korumaNotu && (
            <button type="button" className="m-iconbtn" aria-label="Bilgiyi kapat" onClick={() => setNot(null)}>
              <Dismiss20Regular />
            </button>
          )}
        </div>
      )}
      <main className="m-content m-belge-main" onClick={onTikla}>
        <DocumentView
          editor={editor}
          settings={settings}
          updateSettings={updateSettings}
          controller={controller}
          view={view}
          setView={noop}
          hfEditing={null}
          hfPage={0}
          setHfEditing={noop}
          onHfEditor={noop}
          activeComment={null}
          setActiveComment={noop}
          deleteComment={noop}
          version={version}
          navFocus={0}
          onPageSetup={noop}
          onContextMenu={noop}
          scrollRef={scrollRef}
          printing={false}
          formatPainter={false}
        />
      </main>
      {duzenle && !(panel && BICIM_PANELLERI.includes(panel)) && <AracCubugu editor={editor} fmt={fmt} styles={styles} panel={panel} onPanel={panelAc} onBul={bulAc} onBitir={duzenlemeyiBitir} onEngel={engel} />}

      <Panel id={panel} onClose={panelKapat}>
        {panel === "yazi" && (
          <YaziTipiIcerik
            fmt={fmt}
            onFont={(f) => yaziTipi(editor, f) || engel()}
            onSize={(s) => yaziBoyutu(editor, s) || engel()}
            onStep={(y) => boyutAdim(editor, styles, y) || engel()}
            onMark={(t) => isaretDegistir(editor, t, isaretEtkin(editor, t)) || engel()}
            onClear={() => bicimiTemizle(editor) || engel()}
          />
        )}
        {panel === "renk" && <RenkIcerik tur="yazi" deger={fmt.color} tema={tema} onSec={(c) => yaziRengi(editor, c) || engel()} />}
        {panel === "vurgu" && <RenkIcerik tur="vurgu" deger={fmt.highlight} tema={tema} onSec={(c) => vurguRengi(editor, c) || engel()} />}
        {panel === "paragraf" && <ParagrafIcerik fmt={fmt} onAlign={(a) => hizala(editor, a) || engel()} onIndent={(y) => girinti(editor, y) || engel()} onLine={(v) => satirAraligi(editor, v) || engel()} />}
        {panel === "stil" && <StilIcerik styles={styles} secili={fmt.styleId} ozel={ozelStiller} onSec={(id) => stilUygula(editor, styles, id) || engel()} />}
        {panel === "gorunum" && <GorunumIcerik mod={mod} onMod={setMod} zoom={olcek * 100} onZoom={dugmeYakinlastir} onSigdir={() => (mod === "print" ? setSigdir(true) : setWebOlcek(1))} />}
        {panel === "bilgi" && bilgi && <BilgiIcerik b={bilgi} />}
        {panel === "farkli" && (
          <FarkliKaydetIcerik
            ad={ad}
            onSec={(f) => {
              setPanel(null);
              void kaydet(f);
            }}
          />
        )}
        {panel === "menu" && <MenuIcerik onBul={bulAc} onGorunum={() => setPanel("gorunum")} onPaylas={() => void paylas()} onFarkli={() => setPanel("farkli")} onBilgi={() => panelAc("bilgi")} />}
      </Panel>
    </div>
  );
}
