// Tablo ekranı: masaüstü Tablo'nun denetleyicisi, modeli, formül motoru, okuyucu/yazıcıları ve
// tuval çizicisi üzerine dokunmatik kabuk. Açılışta görüntüleme kipi; kalemle düzenleme kipi.
import { Component, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowRedo24Regular,
  ArrowUndo24Regular,
  Autosum24Regular,
  BorderAll24Regular,
  Checkmark24Regular,
  ClipboardPaste24Regular,
  Copy24Regular,
  Cut24Regular,
  Delete24Regular,
  Edit24Regular,
  Eraser24Regular,
  Grid24Regular,
  MoreVertical24Regular,
  NumberSymbol24Regular,
  PaintBucket24Regular,
  Print24Regular,
  Rename24Regular,
  Save24Regular,
  SaveCopy24Regular,
  Search24Regular,
  Share24Regular,
  TableAdd24Regular,
  TableCellsMerge24Regular,
  TextFont24Regular,
  TextSortAscending24Regular,
  TableFreezeColumnAndRow24Regular,
  TableFreezeRow24Regular,
  TableInsertRow24Regular,
  TableSimple24Regular,
  TextAlignLeft24Regular,
  TextBold24Regular,
  TextColor24Regular,
  TextItalic24Regular,
  TextUnderline24Regular,
  TextWrap24Regular,
  DecimalArrowLeft24Regular,
  DecimalArrowRight24Regular,
  ZoomFit24Regular,
  ZoomIn24Regular,
  ZoomOut24Regular,
  ErrorCircle24Regular,
} from "@fluentui/react-icons";
import { formatRange, type FnDef } from "@officehere/formula";
import { Controller } from "@tablo/controller";
import { WorkbookModel } from "@tablo/model/workbook";
import { buildTemplate } from "@tablo/templates";
import * as E from "@tablo/actions/edit";
import { activeStyle, changeDecimals, toggle, toggleUnderline, toggleWrap } from "@tablo/actions/format";
import { freeze, isFrozen } from "@tablo/actions/view";
import { fileFormatOf, setFileFormat, type FileFormatState } from "@tablo/app/fileFormat";
import { preparePrint } from "@tablo/io/print";
import { buildPrintHtml, paperBox, type PrintScope } from "@tablo/io/printPages";
import "@tablo/styles/tablo.css";
import "@tablo/styles/objects.css";
import "@tablo/styles/panes.css";
import { AppBar, IconButton } from "../shell/AppBar";
import { BottomToolbar, Sheet, ToolButton } from "../shell/Toolbar";
import { confirmDialog, toast } from "../shell/feedback";
import { useBackHandler } from "../shell/back";
import { baseOf, mimeFor, type DocScreenProps } from "../platform";
import { inc, yazdirKisayolu, yazdirmaAc, YAZDIR_ETIKETI, YAZDIR_IPUCU } from "../shell/yazdir";
import { useTaslak } from "../shell/useTaslak";
import { recentWhen } from "../home/util";
import { GridApi, MobileGrid } from "./MobileGrid";
import { FormulaBar } from "./FormulaBar";
import { AlignPanel, ColorPanel, FindBar, FunctionPanel, MenuItem, NumberFormatPanel, RenamePanel, RowsColsPanel, SheetStrip } from "./panels";
import { birlesik, BirlestirSecenekleri, birlestirVeOrtala, FiltrePanel, filtreBul, KenarlikPanel, SiralaFiltrePanel, sutunAdi, YaziTipiPanel } from "./hucre";
import { kopyala, panoyuBirak, yapistir } from "./pano";
import { bookFormat, formatQuestion, markSaved, needsFormatQuestion, openWorkbook, planSave, workbookBytes, type SaveFormat } from "./fileio";
import { statusText } from "./stats";
import { useVisualViewport } from "./viewport";
import "./tablo.css";

type Panel = null | "more" | "saveas" | "print" | "fx" | "color" | "fill" | "align" | "numfmt" | "rows" | "font" | "border" | "sort" | { filter: number } | { sheet: number } | { rename: number };

type LoadState = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

const FORMAT_LABEL: Record<SaveFormat, string> = { xlsx: ".xlsx", ods: "ODS", csv: "CSV", tsv: "TSV" };

export default function TabloScreen({ doc, platform, onClose, dark }: DocScreenProps) {
  const ctl = useMemo(() => new Controller(), []);
  const api = useMemo(() => new GridApi(), []);
  useSyncExternalStore(ctl.subscribe, ctl.getVersion);
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [name, setName] = useState(doc.name);
  const [editing, setEditing] = useState(doc.data === null);
  const [savedOnce, setSavedOnce] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [finding, setFinding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [barFocus, setBarFocus] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closing = useRef(false);
  const vp = useVisualViewport();

  /* ------------------------------ Açma ------------------------------ */

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!doc.data) {
          // Yeni boş kitap ya da masaüstü şablonundan (Aylık Bütçe, Fatura…) yeni kitap
          const wb = doc.template ? buildTemplate(doc.template) : new WorkbookModel();
          setFileFormat(wb, { format: "xlsx" });
          ctl.load(wb, doc.name, null);
        } else if (doc.recovered) {
          // Kurtarılan taslak .xlsx olarak kodlanmıştır; ad ve dosya biçimi özgün belgenin.
          const opened = await openWorkbook(doc.recovered.dataName, doc.data);
          if (!alive) return;
          const wb = opened.wb;
          const ek = doc.recovered.ek as FileFormatState | undefined;
          setFileFormat(wb, ek?.format ? ek : { format: "xlsx" });
          if (wb.active?.hidden) wb.activeIndex = Math.max(0, wb.sheets.findIndex((s) => !s.hidden));
          ctl.load(wb, doc.name, null);
          ctl.infoBar = null;
          ctl.dirty = true;
          setName(doc.name);
          toast(`Kurtarılan taslak (${recentWhen(doc.recovered.savedAt)}): kaydedilmemiş değişiklikler geri getirildi.`, "info");
        } else {
          const opened = await openWorkbook(doc.name, doc.data);
          if (!alive) return;
          const wb = opened.wb;
          // Gizli sayfa etkin olamaz
          if (wb.active?.hidden) wb.activeIndex = Math.max(0, wb.sheets.findIndex((s) => !s.hidden));
          ctl.load(wb, opened.name, null);
          ctl.infoBar = null;
          setName(opened.name);
          if (opened.template) toast("Şablondan yeni çalışma kitabı oluşturuldu.");
          for (const n of opened.notices) toast(n, "info");
        }
        if (alive) setLoad({ kind: "ready" });
      } catch (e) {
        if (alive) setLoad({ kind: "error", message: (e as Error)?.message || "Dosya okunamadı." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [ctl, doc]);

  // Masaüstü denetleyicisinin arayüz bağlantıları
  useEffect(() => {
    ctl.alert = (message, title) => void confirmDialog({ title: title ?? "Tablo", message, buttons: [{ id: "ok", label: "Tamam" }] });
    ctl.focusGrid = () => {};
    ctl.openDialog = (id, arg) => {
      const a = (arg ?? {}) as Record<string, unknown>;
      if (id === "confirm") {
        void confirmDialog({ title: String(a.title ?? "Tablo"), message: String(a.message ?? ""), buttons: [{ id: "ok", label: "Tamam" }, { id: "cancel", label: "İptal" }] }).then((r) => r === "ok" && (a.onOk as () => void)?.());
      } else if (id === "validationError") {
        const style = a.style as string;
        const buttons = style === "stop" ? [{ id: "retry", label: "Yeniden dene" }, { id: "cancel", label: "İptal" }] : style === "warning" ? [{ id: "accept", label: "Evet" }, { id: "retry", label: "Hayır" }, { id: "cancel", label: "İptal" }] : [{ id: "accept", label: "Tamam" }, { id: "cancel", label: "İptal" }];
        void confirmDialog({ title: String(a.title || "Tablo"), message: String(a.message ?? ""), buttons }).then((r) => {
          if (r === "accept") (a.onAccept as () => void)();
          else if (r === "retry") (a.onRetry as () => void)();
          else (a.onCancel as () => void)();
        });
      }
    };
  }, [ctl]);

  if (import.meta.env.DEV) (window as unknown as { __tabloMobil?: Controller }).__tabloMobil = ctl;

  /* ------------------------------ Kaydetme ------------------------------ */

  const askFormat = async (format: SaveFormat): Promise<"same" | "xlsx" | null> => {
    const r = await confirmDialog({
      title: "Biçim",
      message: formatQuestion(format, ctl.sheet.name),
      buttons: [
        { id: "same", label: `${FORMAT_LABEL[format]} olarak kaydet` },
        { id: "xlsx", label: ".xlsx olarak kaydet" },
        { id: "cancel", label: "Vazgeç" },
      ],
    });
    return r === "same" || r === "xlsx" ? r : null;
  };

  const save = async (as?: SaveFormat): Promise<boolean> => {
    if (busy) return false;
    if (ctl.edit && !ctl.commitEdit(null)) return false;
    let plan = planSave(name, bookFormat(ctl.wb), as);
    if (needsFormatQuestion(ctl.wb, plan, !!as)) {
      const choice = await askFormat(plan.format);
      if (!choice) return false;
      if (choice === "xlsx") plan = planSave(name, bookFormat(ctl.wb), "xlsx");
    }
    setBusy(true);
    try {
      const bytes = await workbookBytes(ctl.wb, ctl.sheet, plan);
      // Farklı kaydet: aynı ad olsa da konum sorulur
      const saved = await platform.saveFile(plan.name, bytes, mimeFor(plan.name), as ? { saveAs: true } : undefined);
      const finalName = saved.name || plan.name;
      if (saved.uri) uriRef.current = saved.uri;
      markSaved(ctl.wb, plan);
      ctl.dirty = false;
      setName(finalName);
      setSavedOnce(true);
      ctl.emit();
      if (plan.converted) toast(`Bu biçim yazılamadığı için .xlsx olarak kaydedildi: ${finalName}`, "info");
      else if (plan.format === "csv" || plan.format === "tsv") toast(`Kaydedildi (yalnız «${ctl.sheet.name}» sayfasının değerleri): ${finalName}`, "success");
      else toast(`Kaydedildi: ${finalName}`, "success");
      return true;
    } catch (e) {
      // Konum seçmekten vazgeçildi: hata değil, kirli bayrak aynen kalır
      if ((e as Error)?.name !== "AbortError") toast(`Kaydedilemedi: ${(e as Error)?.message ?? e}`, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Otomatik kurtarma: kaydedilmemiş değişiklikler taslak olarak saklanır (tam doğrulukla .xlsx).
  const uriRef = useRef(doc.uri);
  useTaslak({
    app: "tablo",
    kirli: load.kind === "ready" && ctl.dirty,
    surum: ctl.getVersion(),
    id: doc.recovered?.id,
    bilgi: () => ({ name, uri: uriRef.current, ek: fileFormatOf(ctl.wb) }),
    kodla: async () => ({ data: await workbookBytes(ctl.wb, ctl.sheet, { name: "taslak.xlsx", format: "xlsx", converted: false }), dataName: "taslak.xlsx" }),
    agir: () => ctl.wb.sheets.reduce((n, sh) => n + ctl.wb.engine.cellCount(sh.id), 0) > 20_000,
  });

  const share = async () => {
    if (ctl.edit && !ctl.commitEdit(null)) return;
    try {
      const plan = planSave(name, bookFormat(ctl.wb));
      const bytes = await workbookBytes(ctl.wb, ctl.sheet, plan);
      await platform.shareFile(plan.name, bytes, mimeFor(plan.name));
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast(`Paylaşılamadı: ${(e as Error)?.message ?? e}`, "error");
    }
  };

  /* ------------------------------ Yazdırma ve PDF ------------------------------ */

  // Masaüstünün yazdırma çıktısı: sayfa sonları, sığdırma, kılavuz çizgileri, üst/alt bilgi sayfa ayarlarından.
  const printing = useRef(false);
  const print = async (scope: PrintScope) => {
    setPanel(null);
    if (printing.current || (ctl.edit && !ctl.commitEdit(null))) return;
    const html = buildPrintHtml(ctl.wb, ctl.sheet, { scope, selection: scope === "selection" ? ctl.range : undefined });
    if (!html) {
      toast(scope === "workbook" ? "Çalışma kitabında yazdırılacak veri yok." : "Yazdırılacak veri yok.");
      return;
    }
    printing.current = true;
    const cleanup = preparePrint(ctl.wb, ctl.sheet, html);
    document.documentElement.classList.add("tb-yazdiriliyor");
    try {
      const box = paperBox(ctl.sheet);
      await yazdirmaAc(platform, { name: baseOf(name), page: { width: inc(box.w), height: inc(box.h) } });
    } finally {
      cleanup();
      document.documentElement.classList.remove("tb-yazdiriliyor");
      // Yazdırma kökü ve @page kuralı kaldırılır (sonraki Belge/Sunum yazdırmasını etkilemesin).
      document.getElementById("tb-print")?.remove();
      document.getElementById("tb-print-page")?.remove();
      printing.current = false;
    }
  };

  /* ------------------------------ Kapatma ------------------------------ */

  const requestClose = async () => {
    if (closing.current) return;
    if (ctl.edit && !ctl.commitEdit(null)) return;
    if (!ctl.dirty) {
      onClose();
      return;
    }
    closing.current = true;
    try {
      const r = await confirmDialog({
        title: "Değişiklikler kaydedilsin mi?",
        message: `"${name}" dosyasında kaydedilmemiş değişiklikler var.`,
        buttons: [
          { id: "save", label: "Kaydet" },
          { id: "discard", label: "Kaydetme", danger: true },
          { id: "cancel", label: "Vazgeç" },
        ],
      });
      if (r === "save") {
        if (await save()) onClose();
      } else if (r === "discard") onClose();
    } finally {
      closing.current = false;
    }
  };

  useBackHandler(() => {
    // Açık onay penceresi kendi düğmeleriyle kapanır; arkasında yeni soru açılmaz
    if (closing.current || document.querySelector(".m-confirm")) return true;
    if (panel) {
      setPanel(null);
      return true;
    }
    if (finding) {
      setFinding(false);
      return true;
    }
    if (ctl.edit || document.activeElement === inputRef.current) {
      // Yazılan değer kaybolmaz: giriş onaylanır, klavye kapanır
      if (!ctl.edit || ctl.commitEdit(null)) inputRef.current?.blur();
      return true;
    }
    // Kopyalanan aralığın kesik çizgisi önce kalkar (masaüstünde Esc)
    if (panoyuBirak(ctl)) return true;
    void requestClose();
    return true;
  });

  /* ------------------------------ Düzenleme ------------------------------ */

  const focusInput = (caretEnd = true) => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    if (caretEnd) ta.setSelectionRange(ta.value.length, ta.value.length);
  };

  const startEditing = () => {
    if (!editing) {
      toast("Düzenlemek için kaleme dokunun.");
      return;
    }
    if (!ctl.edit) ctl.startEdit(undefined, true);
    if (ctl.edit) requestAnimationFrame(() => focusInput());
  };

  const finishEditing = () => {
    if (ctl.edit && !ctl.commitEdit(null)) return;
    inputRef.current?.blur();
    setPanel(null);
    setEditing(false);
  };

  const pickFunction = (d: FnDef) => {
    setPanel(null);
    const ed = ctl.edit;
    if (ed) {
      // Formül değilse ve hücre boşsa başına = konur
      const ins = `${ed.text ? "" : "="}${d.tr}(`;
      ctl.updateEdit(ed.text.slice(0, ed.caret) + ins + ed.text.slice(ed.caret), ed.caret + ins.length);
    } else {
      ctl.startEdit(`=${d.tr}(`, true);
    }
    if (ctl.edit) requestAnimationFrame(() => focusInput(false));
  };

  const autoSum = () => {
    if (ctl.edit && !ctl.commitEdit(null)) return;
    if (!ctl.guardSelection()) return;
    E.autoSum(ctl);
    if (ctl.edit) requestAnimationFrame(() => focusInput(false));
  };

  const run = (f: () => void) => () => {
    if (ctl.edit && !ctl.commitEdit(null)) return;
    f();
  };

  const deleteSheet = async (i: number) => {
    setPanel(null);
    const s = ctl.wb.sheets[i];
    if (!s) return;
    const r = await confirmDialog({ title: "Sayfa silinsin mi?", message: `«${s.name}» sayfası ve içindeki veriler silinecek.`, buttons: [{ id: "del", label: "Sil", danger: true }, { id: "cancel", label: "Vazgeç" }] });
    if (r === "del") ctl.ops.deleteSheet(i);
  };

  // Donanım klavyesi (tablet, klavyeli telefon): oklarla gezinme, yazınca düzenleme, Delete ile temizleme
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const kalemUyari = useRef(0);
  keyRef.current = (e) => {
    if (load.kind !== "ready" || e.defaultPrevented || e.isComposing) return;
    if (yazdirKisayolu(e)) {
      e.preventDefault();
      setPanel("print");
      return;
    }
    if (panel || finding) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.("input, textarea, select, [contenteditable='true']") || document.querySelector(".m-confirm")) return;
    const mod = e.ctrlKey || e.metaKey;
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const done = () => e.preventDefault();
    if (arrows[e.key] && !e.altKey) {
      ctl.move(arrows[e.key][0], arrows[e.key][1], e.shiftKey, mod);
      return done();
    }
    if ((e.key === "Enter" || e.key === "Tab") && !mod && !e.altKey) {
      // Enter ↓, Sekme →; Sekmelerle ilerleyip Enter'a basınca başlangıç sütununun altına dönülür
      ctl.advance(e.key === "Enter" ? (e.shiftKey ? "up" : "down") : e.shiftKey ? "left" : "right");
      return done();
    }
    if (mod && !e.altKey && e.code === "KeyS") {
      void save();
      return done();
    }
    if (mod && !e.altKey && !e.shiftKey && e.code === "KeyC") {
      void kopyala(ctl, platform, false);
      return done();
    }
    if (e.key === "Escape" && panoyuBirak(ctl)) return done();
    if (!editing) {
      if (e.key.length === 1 && !mod && !e.altKey && Date.now() - kalemUyari.current > 3000) {
        kalemUyari.current = Date.now();
        toast("Düzenlemek için kaleme dokunun.");
      }
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && (e.code === "KeyX" || e.code === "KeyV")) {
      if (e.code === "KeyX") void kopyala(ctl, platform, true);
      else void yapistir(ctl, platform);
      return done();
    }
    if (mod && !e.altKey && (e.code === "KeyZ" || e.code === "KeyY")) {
      if (e.code === "KeyZ" && !e.shiftKey) E.undo(ctl);
      else E.redo(ctl);
      return done();
    }
    if (mod || e.altKey) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      E.clearContents(ctl);
      return done();
    }
    if (e.key === "F2") {
      startEditing();
      return done();
    }
    if (e.key.length === 1) {
      // Seçili hücreye doğrudan yazma: odak hemen formül çubuğuna geçer, hızlı yazılan sonraki harfler
      // de oraya düşer (kare beklenirse kaybolurdu).
      ctl.startEdit(e.key, true);
      const ta = inputRef.current;
      if (ctl.edit && ta) {
        ta.value = ctl.edit.text;
        focusInput();
      }
      return done();
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  /* ------------------------------ Görünüm ------------------------------ */

  // Klavye açıkken formül çubuğu (giriş sürerken ve Enter'la sonraki hücreye geçince) klavyenin üstünde
  const docked = vp.keyboard && (barFocus || !!ctl.edit) && !finding;
  const saved = !ctl.dirty && (doc.data !== null || savedOnce);
  const style = load.kind === "ready" ? activeStyle(ctl) : {};
  const sheet = ctl.sheet;
  const visibleSheets = ctl.wb.sheets.filter((s) => !s.hidden).length;
  const screenStyle = vp.keyboard ? { position: "fixed" as const, left: 0, right: 0, top: vp.top, height: vp.height } : undefined;
  const ready = load.kind === "ready";

  const actions = editing ? (
    <>
      <IconButton label="Geri al" disabled={!ready || (!ctl.ops.history.canUndo && !ctl.edit)} onClick={() => (E.undo(ctl), inputRef.current?.blur())}>
        <ArrowUndo24Regular />
      </IconButton>
      <IconButton label="Yinele" disabled={!ready || !ctl.ops.history.canRedo || !!ctl.edit} onClick={() => E.redo(ctl)}>
        <ArrowRedo24Regular />
      </IconButton>
      <IconButton label="Kaydet" disabled={!ready || busy} onClick={() => void save()}>
        <Save24Regular />
      </IconButton>
      <IconButton label="Daha fazla" disabled={!ready} onClick={() => setPanel("more")}>
        <MoreVertical24Regular />
      </IconButton>
    </>
  ) : (
    <>
      <IconButton label="Düzenle" disabled={!ready} onClick={() => setEditing(true)}>
        <Edit24Regular />
      </IconButton>
      <IconButton label="Kaydet" disabled={!ready || busy} onClick={() => void save()}>
        <Save24Regular />
      </IconButton>
      <IconButton label="Daha fazla" disabled={!ready} onClick={() => setPanel("more")}>
        <MoreVertical24Regular />
      </IconButton>
    </>
  );

  const sheetPanel = panel && typeof panel === "object" && "sheet" in panel ? panel.sheet : null;
  const renamePanel = panel && typeof panel === "object" && "rename" in panel ? panel.rename : null;
  const filterPanel = panel && typeof panel === "object" && "filter" in panel ? panel.filter : null;
  const closePanel = () => setPanel(null);

  return (
    <div className={`m-screen m-tablo${docked ? " is-docked" : ""}${vp.keyboard ? " has-keyboard" : ""}${dark ? " is-dark" : ""}`} style={screenStyle}>
      <AppBar title={name} subtitle={`Tablo · ${saved ? "Kaydedildi" : "Kaydedilmedi"}`} onBack={() => void requestClose()} actions={actions} />
      {load.kind === "loading" && <div className="m-tablo-state">Açılıyor…</div>}
      {load.kind === "error" && (
        <div className="m-tablo-state is-error" role="alert">
          <ErrorCircle24Regular />
          <h2>Dosya açılamadı</h2>
          <p>{load.message}</p>
          <button type="button" className="m-btn is-primary" onClick={onClose}>
            Geri dön
          </button>
        </div>
      )}
      {ready && (
        <>
          {finding ? <FindBar ctl={ctl} editable={editing} onClose={() => setFinding(false)} /> : <FormulaBar ctl={ctl} editable={editing} docked={docked} inputRef={inputRef} onFx={() => setPanel("fx")} onFocusChange={setBarFocus} />}
          <main className="m-tablo-main">
            <GridBoundary>
              <MobileGrid ctl={ctl} dark={dark} api={api} describedBy="m-tablo-status" onEditRequest={startEditing} onFilterButton={editing ? (col) => setPanel({ filter: col }) : undefined} />
            </GridBoundary>
          </main>
          <div className="m-tablo-foot">
            <div className="m-tablo-status">
              <span id="m-tablo-status" className="m-tablo-status-text" role="status" aria-live="polite" aria-label="Hücre bilgisi">
                {statusText(ctl)}
              </span>
              <ZoomControls api={api} />
            </div>
            <SheetStrip ctl={ctl} editable={editing} onMenu={(i) => setPanel({ sheet: i })} />
          </div>
          {editing && !docked && (
            <BottomToolbar label="Biçimlendirme">
              <ToolButton icon={<Autosum24Regular />} label="Otomatik Toplam" onClick={autoSum} />
              <ToolButton icon={<Cut24Regular />} label="Kes" onClick={() => void kopyala(ctl, platform, true)} />
              <ToolButton icon={<Copy24Regular />} label="Kopyala" onClick={() => void kopyala(ctl, platform, false)} />
              <ToolButton icon={<ClipboardPaste24Regular />} label="Yapıştır" onClick={() => void yapistir(ctl, platform)} />
              <ToolButton icon={<TextBold24Regular />} label="Kalın" active={!!style.bold} onClick={run(() => toggle(ctl, "bold"))} />
              <ToolButton icon={<TextItalic24Regular />} label="İtalik" active={!!style.italic} onClick={run(() => toggle(ctl, "italic"))} />
              <ToolButton icon={<TextUnderline24Regular />} label="Altı çizili" active={!!style.underline} onClick={run(() => toggleUnderline(ctl))} />
              <ToolButton icon={<TextFont24Regular />} label="Yazı tipi ve boyutu" onClick={() => setPanel("font")} />
              <ToolButton icon={<ColorIcon icon={<TextColor24Regular />} color={style.color ?? "#000000"} />} label="Yazı rengi" onClick={() => setPanel("color")} />
              <ToolButton icon={<ColorIcon icon={<PaintBucket24Regular />} color={style.fill ?? "transparent"} />} label="Dolgu rengi" onClick={() => setPanel("fill")} />
              <ToolButton icon={<BorderAll24Regular />} label="Kenarlıklar" onClick={() => setPanel("border")} />
              <ToolButton icon={<TextAlignLeft24Regular />} label="Hizalama" onClick={() => setPanel("align")} />
              <ToolButton icon={<TextWrap24Regular />} label="Metni kaydır" active={!!style.wrap} onClick={run(() => toggleWrap(ctl))} />
              <ToolButton icon={<TableCellsMerge24Regular />} label="Birleştir ve ortala" active={birlesik(ctl)} onClick={() => birlestirVeOrtala(ctl)} />
              <ToolButton icon={<NumberSymbol24Regular />} label="Sayı biçimi" onClick={() => setPanel("numfmt")} />
              <ToolButton icon={<DecimalArrowRight24Regular />} label="Ondalık artır" onClick={run(() => changeDecimals(ctl, 1))} />
              <ToolButton icon={<DecimalArrowLeft24Regular />} label="Ondalık azalt" onClick={run(() => changeDecimals(ctl, -1))} />
              <ToolButton icon={<TextSortAscending24Regular />} label="Sırala ve filtrele" active={!!filtreBul(ctl)} onClick={() => setPanel("sort")} />
              <ToolButton icon={<TableInsertRow24Regular />} label="Satır ve sütun" onClick={() => setPanel("rows")} />
              <ToolButton icon={<Eraser24Regular />} label="Hücreyi temizle" onClick={run(() => E.clearContents(ctl))} />
            </BottomToolbar>
          )}
        </>
      )}

      <Sheet open={panel === "more"} title="Daha fazla" onClose={closePanel}>
        <div className="m-tablo-list">
          {editing && <MenuItem icon={<Checkmark24Regular />} label="Düzenlemeyi bitir" hint="Görüntüleme kipine geç" onClick={finishEditing} />}
          {!editing && <MenuItem icon={<Copy24Regular />} label="Kopyala" hint={formatRange(ctl.range)} onClick={() => (closePanel(), void kopyala(ctl, platform, false))} />}
          <MenuItem icon={<Share24Regular />} label="Paylaş" onClick={() => (closePanel(), void share())} />
          <MenuItem icon={<SaveCopy24Regular />} label="Farklı kaydet" onClick={() => setPanel("saveas")} />
          <MenuItem icon={<Print24Regular />} label={YAZDIR_ETIKETI} hint={YAZDIR_IPUCU} onClick={() => setPanel("print")} />
          <MenuItem icon={<Search24Regular />} label="Bul" onClick={() => (closePanel(), setFinding(true))} />
          {isFrozen(ctl) ? (
            <MenuItem icon={<TableFreezeColumnAndRow24Regular />} label="Bölmeleri çöz" onClick={() => (closePanel(), freeze(ctl, "none"))} />
          ) : (
            <>
              <MenuItem icon={<TableFreezeColumnAndRow24Regular />} label="Bölmeleri dondur" hint={`${ctl.activeAddress()} hücresinin üstü ve solu`} onClick={() => (closePanel(), freeze(ctl, "panes"))} />
              <MenuItem icon={<TableFreezeRow24Regular />} label="Üst satırı dondur" onClick={() => (closePanel(), freeze(ctl, "topRow"))} />
            </>
          )}
          <MenuItem icon={<Grid24Regular />} label="Kılavuz çizgileri" checked={sheet.showGridlines} onClick={() => ((sheet.showGridlines = !sheet.showGridlines), ctl.emit())} />
          <MenuItem icon={<TableSimple24Regular />} label="Başlıklar" checked={sheet.showHeadings} onClick={() => ((sheet.showHeadings = !sheet.showHeadings), ctl.emit())} />
          <MenuItem icon={<ZoomFit24Regular />} label="Yakınlaştırmayı sıfırla (%100)" onClick={() => (closePanel(), api.setZoom(100))} />
          {editing && <MenuItem icon={<TableAdd24Regular />} label="Yeni sayfa ekle" onClick={() => (closePanel(), ctl.ops.addSheet(ctl.wb.activeIndex + 1))} />}
        </div>
      </Sheet>

      <Sheet open={panel === "saveas"} title="Farklı kaydet" onClose={closePanel}>
        <div className="m-tablo-list">
          <MenuItem icon={<SaveCopy24Regular />} label="Çalışma kitabı (.xlsx)" hint="Tüm sayfalar, biçimler ve grafikler" onClick={() => (closePanel(), void save("xlsx"))} />
          <MenuItem icon={<SaveCopy24Regular />} label="OpenDocument hesap tablosu (.ods)" hint="Bazı özellikler kaybolabilir" onClick={() => (closePanel(), void save("ods"))} />
          <MenuItem icon={<SaveCopy24Regular />} label="CSV (.csv)" hint="Yalnız etkin sayfanın değerleri" onClick={() => (closePanel(), void save("csv"))} />
        </div>
      </Sheet>

      <Sheet open={panel === "print"} title={YAZDIR_ETIKETI} onClose={closePanel}>
        <div className="m-tablo-list">
          <MenuItem icon={<Print24Regular />} label="Etkin sayfa" hint={`«${sheet.name}»`} onClick={() => void print("active")} />
          <MenuItem icon={<Print24Regular />} label="Tüm çalışma kitabı" hint={`${visibleSheets} sayfa`} onClick={() => void print("workbook")} />
          <MenuItem icon={<Print24Regular />} label="Seçim" hint={formatRange(ctl.range)} onClick={() => void print("selection")} />
        </div>
        <p className="m-tablo-note">{YAZDIR_IPUCU}. Kâğıt boyutu, yönlendirme ve kenar boşlukları sayfanın yazdırma ayarlarından alınır.</p>
      </Sheet>

      <Sheet open={panel === "fx"} title="İşlev ekle" onClose={closePanel}>
        <FunctionPanel onPick={pickFunction} />
      </Sheet>
      <Sheet open={panel === "color"} title="Yazı rengi" modeless onClose={closePanel}>
        <ColorPanel ctl={ctl} kind="color" onDone={closePanel} />
      </Sheet>
      <Sheet open={panel === "fill"} title="Dolgu rengi" modeless onClose={closePanel}>
        <ColorPanel ctl={ctl} kind="fill" onDone={closePanel} />
      </Sheet>
      <Sheet open={panel === "align"} title="Hizalama" modeless onClose={closePanel}>
        <AlignPanel ctl={ctl} />
        <h3 className="m-tablo-subhead">Birleştir</h3>
        <BirlestirSecenekleri ctl={ctl} onDone={closePanel} />
      </Sheet>
      <Sheet open={panel === "numfmt"} title="Sayı biçimi" modeless onClose={closePanel}>
        <NumberFormatPanel ctl={ctl} onDone={closePanel} />
      </Sheet>
      <Sheet open={panel === "rows"} title="Satır ve sütun" modeless onClose={closePanel}>
        <RowsColsPanel ctl={ctl} onDone={closePanel} />
      </Sheet>
      <Sheet open={panel === "font"} title="Yazı tipi" modeless onClose={closePanel}>
        <YaziTipiPanel ctl={ctl} />
      </Sheet>
      <Sheet open={panel === "border"} title="Kenarlıklar" modeless onClose={closePanel}>
        <KenarlikPanel ctl={ctl} onDone={closePanel} />
      </Sheet>
      <Sheet open={panel === "sort"} title="Sırala ve filtrele" onClose={closePanel}>
        <SiralaFiltrePanel ctl={ctl} onFilter={(col) => setPanel({ filter: col })} onDone={closePanel} />
      </Sheet>
      <Sheet open={filterPanel !== null} title={filterPanel !== null && filtreBul(ctl, filterPanel) ? `Filtre: ${sutunAdi(ctl, filtreBul(ctl, filterPanel)!, filterPanel)}` : "Filtre"} onClose={closePanel}>
        {filterPanel !== null && <FiltrePanel key={filterPanel} ctl={ctl} col={filterPanel} onDone={closePanel} />}
      </Sheet>
      <Sheet open={sheetPanel !== null} title={sheetPanel !== null ? `Sayfa: ${ctl.wb.sheets[sheetPanel]?.name ?? ""}` : "Sayfa"} onClose={closePanel}>
        {sheetPanel !== null && (
          <div className="m-tablo-list">
            <MenuItem icon={<Rename24Regular />} label="Yeniden adlandır" onClick={() => setPanel({ rename: sheetPanel })} />
            <MenuItem icon={<TableAdd24Regular />} label="Sağa yeni sayfa ekle" onClick={() => (closePanel(), ctl.ops.addSheet(sheetPanel + 1))} />
            <MenuItem icon={<Delete24Regular />} label="Sayfayı sil" danger disabled={visibleSheets <= 1} onClick={() => void deleteSheet(sheetPanel)} />
          </div>
        )}
      </Sheet>
      <Sheet open={renamePanel !== null} title="Sayfayı yeniden adlandır" onClose={closePanel}>
        {renamePanel !== null && <RenamePanel ctl={ctl} index={renamePanel} onDone={closePanel} />}
      </Sheet>
    </div>
  );
}

/** Simgenin altında seçili rengi gösteren çubuk. */
function ColorIcon({ icon, color }: { icon: ReactNode; color: string }) {
  return (
    <span className="m-tablo-coloricon">
      {icon}
      <i style={{ background: color }} />
    </span>
  );
}

/** Yakınlaştırma düğmeleri ve yüzdesi (ızgara çizildikçe güncellenir). */
function ZoomControls({ api }: { api: GridApi }) {
  const zoom = useSyncExternalStore(api.subscribe, api.getZoom);
  return (
    <div className="m-tablo-zoom" role="group" aria-label="Yakınlaştırma">
      <button type="button" className="m-iconbtn" aria-label="Uzaklaştır" title="Uzaklaştır" onClick={() => api.zoomBy(-1)}>
        <ZoomOut24Regular />
      </button>
      <button type="button" className="m-tablo-zoom-value" aria-label={`Yakınlaştırma yüzde ${zoom}; sıfırla`} onClick={() => api.setZoom(100)}>
        %{zoom}
      </button>
      <button type="button" className="m-iconbtn" aria-label="Yakınlaştır" title="Yakınlaştır" onClick={() => api.zoomBy(1)}>
        <ZoomIn24Regular />
      </button>
    </div>
  );
}

/** Izgara çizimindeki beklenmedik hata ekranın geri kalanını düşürmesin. */
class GridBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="m-tablo-state is-error" role="alert">
          <ErrorCircle24Regular />
          <h2>Sayfa gösterilemedi</h2>
          <p>{this.state.error.message}</p>
          <button type="button" className="m-btn" onClick={() => this.setState({ error: null })}>
            Yeniden dene
          </button>
        </div>
      );
    return this.props.children;
  }
}
