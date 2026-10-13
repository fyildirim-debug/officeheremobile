// Dokunmatik ızgara: masaüstü tuval çizicisi (render.ts) ve geometrisi (layout.ts) aynen kullanılır.
// Tek parmak eylemsizlikli kaydırır, iki parmak yakınlaştırır; dokunma hücre seçer, uzun basıp
// sürükleme ya da tutamaçlar aralık seçer. Grafik/resim/şekil/dilimleyici katmanı yalnız görüntülenir.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { fontStack } from "@officehere/core";
import type { Controller } from "@tablo/controller";
import { GridLayout } from "@tablo/grid/layout";
import { measureText, renderGrid, type RenderState } from "@tablo/grid/render";
import { activeFilterRows } from "@tablo/grid/gridUtil";
import { ColoredText } from "@tablo/grid/CellEditor";
import { filtersOf } from "@tablo/actions/data";
import { pivotButtons } from "@tablo/pivot/pivotOps";
import { PivotPlaceholders } from "@tablo/pivot/PivotPlaceholder";
import { FloatingLayer } from "@tablo/charts/FloatingLayer";
import { SlicerLayer } from "@tablo/charts/SlicerLayer";
import { computeView } from "@tablo/model/display";
import { MAX_COLS, MAX_ROWS, contains, rect } from "@tablo/model/rect";
import { expandForMerges } from "@tablo/model/selection";
import { fontCss } from "@tablo/model/styles";
import type { CellPos } from "@tablo/model/types";
import { DARK_BG, darkContext, darkGround, ink, isWhite, lightNeutral, type DarkProbe } from "./darkCanvas";
import { objectsDarkCss } from "./darkObjects";
import { Inertia, axisLock, cellAtPoint, cellUnder, clampZoom, nearestHandle, selectionHandles, zoomAround, zoomStep, type TouchHit } from "./touch";

/** Izgaranın dışarıya açtığı denetimler (yakınlaştırma düğmeleri, yakınlaştırma göstergesi). */
export class GridApi {
  zoom = 100;
  zoomBy: (dir: 1 | -1) => void = () => {};
  setZoom: (z: number) => void = () => {};
  private ls = new Set<() => void>();
  subscribe = (fn: () => void) => {
    this.ls.add(fn);
    return () => void this.ls.delete(fn);
  };
  getZoom = () => this.zoom;
  emit(): void {
    this.ls.forEach((f) => f());
  }
}

const ACCENT = "#107C41";
const SLOP = 9;
const LONG_PRESS = 420;
const EDGE = 28;

type Gesture =
  | { kind: "pending"; id: number; x0: number; y0: number; sx: number; sy: number; hit: TouchHit; flinging: boolean }
  | { kind: "pan"; id: number; lastX: number; lastY: number; axis: "x" | "y" | null }
  | { kind: "select"; id: number; anchor: CellPos }
  | { kind: "handle"; id: number; fixed: CellPos }
  | { kind: "point"; id: number; anchor: CellPos }
  | { kind: "colsel"; id: number; start: number }
  | { kind: "rowsel"; id: number; start: number }
  | { kind: "pinch"; d0: number; z0: number; cx: number; cy: number; before: GridLayout };

export interface MobileGridProps {
  ctl: Controller;
  dark: boolean;
  api: GridApi;
  /** Seçili hücreye çift dokunma (düzenleme kipinde düzenlemeyi başlatır). */
  onEditRequest: () => void;
  /** Erişilebilir durum metninin kimliği. */
  describedBy?: string;
}

export function MobileGrid({ ctl, dark, api, onEditRequest, describedBy }: MobileGridProps) {
  useSyncExternalStore(ctl.subscribe, ctl.getVersion);
  const sheet = ctl.sheet;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrolls = useRef(new Map<number, { x: number; y: number }>());
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const [, setTick] = useState(0);
  const layoutRef = useRef<GridLayout | null>(null);
  const renderedKey = useRef("");
  const raf = useRef(0);
  const props = useRef({ dark, onEditRequest });
  props.current = { dark, onEditRequest };

  const scroll = () => {
    const id = ctl.sheet.id;
    let s = scrolls.current.get(id);
    if (!s) scrolls.current.set(id, (s = { x: 0, y: 0 }));
    return s;
  };
  const measureDigits = (n: number) => measureText("8".repeat(n), `${11 * Math.max(0.65, Math.min(ctl.sheet.zoom / 100, 2.2))}px "Segoe UI", sans-serif`);
  const makeLayout = (x?: number, y?: number) => {
    const s = scroll();
    return new GridLayout(ctl.sheet, size.current.w, size.current.h, x ?? s.x, y ?? s.y, measureDigits);
  };
  const keyOf = (L: GridLayout) => `${ctl.sheet.id}:${L.scrollX}:${L.scrollY}:${L.z}:${L.width}:${L.height}`;
  const hasObjects = () => {
    const s = ctl.sheet;
    return s.charts.length + s.images.length + s.shapes.length + s.slicers.length + s.pivots.length > 0;
  };

  /* ------------------------------ Çizim ------------------------------ */

  const showHandles = () => !ctl.edit && ctl.sel.ranges.length === 1;

  const probeFor = (L: GridLayout): DarkProbe => {
    const sh = ctl.sheet;
    const wb = ctl.wb;
    const plain = !sh.tables.length && !sh.condFormats.length;
    const cache = new Map<number, boolean>();
    return {
      headerW: L.headerW,
      headerH: L.headerH,
      thin: Math.max(3, 4.5 * L.z),
      paper(x, y) {
        if (x < L.headerW || y < L.headerH) return false;
        let row = L.rowAtY(y);
        let col = L.colAtX(x);
        const m = sh.mergeAt(row, col);
        if (m) {
          row = m.r1;
          col = m.c1;
        }
        const k = row * 16384 + col;
        let v = cache.get(k);
        if (v === undefined) {
          if (plain && wb.styleIdAt(sh, row, col) === 0) v = false;
          else {
            const view = computeView(wb, sh, row, col, ctl.cf);
            // Kâğıttaki gibi kalan zemin: belirgin dolgu ya da desen (açık nötr/pastel dolgu koyulaşır)
            v = (!!view.fill && !lightNeutral(view.fill) && !isWhite(view.fill)) || !!view.style.pattern;
          }
          cache.set(k, v);
        }
        return v;
      },
    };
  };

  const paint = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !size.current.w || !size.current.h) return;
    const { dpr } = size.current;
    const sh = ctl.sheet;
    const L = makeLayout();
    layoutRef.current = L;
    const e = ctl.edit;
    const refs =
      e && (e.sheetId === sh.id || e.text.includes("!"))
        ? ctl.editRefs().filter((r) => (r.sheetName ? r.sheetName.toLocaleUpperCase("tr-TR") === sh.name.toLocaleUpperCase("tr-TR") : e.sheetId === sh.id))
        : [];
    const filterButtons: RenderState["filterButtons"] = [];
    for (const f of filtersOf(sh)) for (let col = f.range.c1; col <= f.range.c2; col++) filterButtons.push({ row: f.range.r1, col, active: !!f.columns[col - f.range.c1] });
    for (const b of pivotButtons(sh)) filterButtons.push({ row: b.row, col: b.col, active: b.active });
    const spill = ctl.wb.engine.getSpill(sh.id, ctl.sel.active.row, ctl.sel.active.col);
    const dark = props.current.dark;
    const st: RenderState = {
      wb: ctl.wb,
      sheet: sh,
      layout: L,
      cf: ctl.cf,
      dpr,
      selection: ctl.sel,
      showSelection: !(e && e.pointSpan && e.sheetId !== sh.id),
      refs,
      clip: null,
      fillPreview: null,
      movePreview: null,
      editing: e && e.sheetId === sh.id ? { row: e.row, col: e.col } : null,
      filterButtons,
      spill: spill ? rect(spill.anchorRow, spill.anchorCol, spill.anchorRow + spill.rows - 1, spill.anchorCol + spill.cols - 1) : null,
      dark,
      arrows: ctl.arrows,
      errorCheck: ctl.errorChecking,
      pageBreaks: null,
      filtered: activeFilterRows(sh),
    };
    renderGrid(dark ? darkContext(ctx, probeFor(L)) : ctx, st);
    // Dokunmatik seçim tutamaçları
    if (showHandles()) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const h of selectionHandles(L, ctl.range)) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = dark ? DARK_BG : "#FFFFFF";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(h.x, h.y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = ACCENT;
        ctx.fill();
      }
      ctx.restore();
    }
    // Görünüm sol üst hücresi (masaüstündeki gibi; bölme dondurma ve kayıt için)
    sh.scroll = { row: L.visibleRows()[0], col: L.visibleCols()[0] };
    // Nesne ve düzenleme katmanları kaydırmayı izler
    if ((hasObjects() || ctl.edit) && keyOf(L) !== renderedKey.current) setTick((t) => t + 1);
    if (Math.round(sh.zoom) !== api.zoom) {
      api.zoom = Math.round(sh.zoom);
      api.emit();
    }
  };

  const draw = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      paint();
    });
  };

  /** Kaydırmayı sınırlar içinde ayarlar; sınıra dayandıysa eksenler döner. */
  const setScroll = (x: number, y: number): { hitX: boolean; hitY: boolean } => {
    const max = makeLayout().maxScroll();
    const s = scroll();
    const nx = Math.max(0, Math.min(max.x, x));
    const ny = Math.max(0, Math.min(max.y, y));
    const res = { hitX: nx !== x, hitY: ny !== y };
    if (nx !== s.x || ny !== s.y) {
      s.x = nx;
      s.y = ny;
      draw();
    }
    return res;
  };

  useEffect(() => {
    draw();
  });

  useEffect(
    () => () => {
      // StrictMode'da etki yeniden bağlanır: bekleyen çizim bayrağı da sıfırlanmalı
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    },
    [],
  );

  // Boyut ve piksel yoğunluğu
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const prev = size.current;
      if (w === prev.w && h === prev.h && dpr === prev.dpr) return;
      size.current = { w, h, dpr };
      const c = canvasRef.current;
      if (c) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
      }
      // Klavye açılıp alan daralınca düzenlenen hücre görünür kalır
      const e = ctl.edit;
      if (e && h < prev.h) requestAnimationFrame(() => ctl.edit && ctl.scrollIntoView(ctl.edit.row, ctl.edit.col));
      paint();
      setTick((t) => t + 1);
    };
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Denetleyici geri çağrıları
  useEffect(() => {
    ctl.scrollIntoView = (row, col) => {
      if (!size.current.w) return;
      const L = makeLayout();
      const p = L.scrollFor(Math.min(row, MAX_ROWS - 1), Math.min(col, MAX_COLS - 1));
      const s = scroll();
      if (p.x !== s.x || p.y !== s.y) setScroll(p.x, p.y);
    };
    ctl.cellClientRect = (row, col) => {
      const L = layoutRef.current;
      const w = wrapRef.current;
      if (!L || !w) return null;
      const m = ctl.sheet.mergeAt(row, col);
      const rc = m ? L.cellRect(m.r1, m.c1, m.r2, m.c2) : L.cellRect(row, col);
      const b = w.getBoundingClientRect();
      return { x: b.left + rc.x, y: b.top + rc.y, w: rc.w, h: rc.h };
    };
    api.setZoom = (z) => zoomTo(z, size.current.w / 2, size.current.h / 2);
    api.zoomBy = (dir) => zoomTo(zoomStep(ctl.sheet.zoom, dir), size.current.w / 2, size.current.h / 2);
  });

  /* ------------------------------ Yakınlaştırma ------------------------------ */

  const zoomTo = (z: number, fx: number, fy: number) => {
    const before = makeLayout();
    ctl.sheet.zoom = Math.round(clampZoom(z));
    const after = makeLayout(0, 0);
    const p = zoomAround(before, after, fx, fy);
    setScroll(p.x, p.y);
    draw();
    ctl.emit();
  };

  /* ------------------------------ Dokunma ------------------------------ */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inertia = useRef(new Inertia());
  const flingRaf = useRef(0);
  const lastTap = useRef<{ t: number; x: number; y: number; row: number; col: number } | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const edgeRaf = useRef(0);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const clearLongPress = () => {
    if (lpTimer.current) clearTimeout(lpTimer.current);
    lpTimer.current = null;
  };

  const stopFling = (): boolean => {
    const was = flingRaf.current !== 0;
    cancelAnimationFrame(flingRaf.current);
    flingRaf.current = 0;
    inertia.current.reset();
    return was;
  };

  const startFling = (vx: number, vy: number) => {
    if (Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05) return;
    const ine = inertia.current;
    ine.vx = vx;
    ine.vy = vy;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(34, now - last);
      last = now;
      const d = ine.step(dt);
      if (!d) {
        flingRaf.current = 0;
        return;
      }
      const s = scroll();
      const hit = setScroll(s.x + d.dx, s.y + d.dy);
      if (hit.hitX) ine.vx = 0;
      if (hit.hitY) ine.vy = 0;
      flingRaf.current = requestAnimationFrame(step);
    };
    flingRaf.current = requestAnimationFrame(step);
  };

  // Dokunarak onaylanan girişte klavye açık kalır: yeni hücreye hemen yazılabilir
  const commitIfEditing = (): boolean => !ctl.edit || ctl.commitEdit(null);

  const pointAt = (row: number, col: number, anchor?: CellPos) => {
    const a = anchor ?? { row, col };
    ctl.pointTo(expandForMerges(ctl.sheet, rect(a.row, a.col, row, col)), ctl.sheet, a, { row, col });
  };

  /** Tek dokunma (ya da fare tıklaması). */
  const tap = (hit: TouchHit, p: { x: number; y: number }, t: number) => {
    const prev = lastTap.current;
    const dbl = !!prev && hit.area === "cell" && t - prev.t < 380 && prev.row === hit.row && prev.col === hit.col && (prev.x - p.x) ** 2 + (prev.y - p.y) ** 2 < 32 * 32;
    lastTap.current = dbl ? null : { t, x: p.x, y: p.y, row: hit.row, col: hit.col };
    if (ctl.edit) {
      // Formül yazarken dokunulan hücre başvuru olarak eklenir
      if (hit.area === "cell" && ctl.canPoint()) {
        pointAt(hit.row, hit.col);
        return;
      }
      if (!commitIfEditing()) return;
    }
    switch (hit.area) {
      case "corner":
        ctl.selectAll();
        return;
      case "colHeader":
        ctl.selectColumns(hit.col, hit.col);
        return;
      case "rowHeader":
        ctl.selectRows(hit.row, hit.row);
        return;
      case "cell": {
        const m = ctl.sheet.mergeAt(hit.row, hit.col);
        const a = ctl.sel.active;
        const already = ctl.sel.ranges.length === 1 && (m ? contains(m, a.row, a.col) : a.row === hit.row && a.col === hit.col);
        if (dbl && already) {
          props.current.onEditRequest();
          return;
        }
        ctl.selectCell(hit.row, hit.col, false);
        return;
      }
    }
  };

  /** Sürükleme sırasında seçim/başvuru güncellemesi. */
  const dragTo = (p: { x: number; y: number }) => {
    const g = gesture.current;
    const L = layoutRef.current;
    if (!g || !L) return;
    const sh = ctl.sheet;
    const q = cellUnder(L, p.x, p.y);
    switch (g.kind) {
      case "select": {
        if (q.row === ctl.corner.row && q.col === ctl.corner.col) return;
        ctl.corner = q;
        const s = ctl.sel;
        ctl.setSelection({ ...s, ranges: [...s.ranges.slice(0, -1), expandForMerges(sh, rect(g.anchor.row, g.anchor.col, q.row, q.col))] }, false);
        return;
      }
      case "handle": {
        if (q.row === ctl.corner.row && q.col === ctl.corner.col) return;
        ctl.corner = q;
        const r = expandForMerges(sh, rect(g.fixed.row, g.fixed.col, q.row, q.col));
        const a = ctl.sel.active;
        const active = contains(r, a.row, a.col) ? a : g.fixed;
        ctl.setSelection({ ranges: [r], active, anchor: g.fixed }, false);
        return;
      }
      case "point":
        pointAt(q.row, q.col, g.anchor);
        return;
      case "colsel": {
        const col = L.colAtX(Math.max(L.headerW, p.x));
        ctl.corner = { row: MAX_ROWS - 1, col };
        ctl.setSelection({ ...ctl.sel, ranges: [rect(0, Math.min(g.start, col), MAX_ROWS - 1, Math.max(g.start, col))] }, false);
        return;
      }
      case "rowsel": {
        const row = L.rowAtY(Math.max(L.headerH, p.y));
        ctl.corner = { row, col: MAX_COLS - 1 };
        ctl.setSelection({ ...ctl.sel, ranges: [rect(Math.min(g.start, row), 0, Math.max(g.start, row), MAX_COLS - 1)] }, false);
        return;
      }
    }
  };

  const isDragKind = (g: Gesture | null) => !!g && (g.kind === "select" || g.kind === "handle" || g.kind === "point" || g.kind === "colsel" || g.kind === "rowsel");

  /** Kenara yakın sürüklemede otomatik kaydırma. */
  const edgeScroll = () => {
    cancelAnimationFrame(edgeRaf.current);
    edgeRaf.current = 0;
    const p = lastPoint.current;
    const L = layoutRef.current;
    if (!p || !L || !isDragKind(gesture.current)) return;
    let dx = 0;
    let dy = 0;
    if (p.x > L.width - EDGE) dx = Math.min(24, (p.x - (L.width - EDGE)) * 0.6 + 2);
    else if (p.x < L.cellsX + EDGE && L.fc === 0 && gesture.current?.kind !== "rowsel") dx = -Math.min(24, (L.cellsX + EDGE - p.x) * 0.6 + 2);
    if (p.y > L.height - EDGE) dy = Math.min(24, (p.y - (L.height - EDGE)) * 0.6 + 2);
    else if (p.y < L.cellsY + EDGE && L.fr === 0 && gesture.current?.kind !== "colsel") dy = -Math.min(24, (L.cellsY + EDGE - p.y) * 0.6 + 2);
    if (!dx && !dy) return;
    const s = scroll();
    setScroll(s.x + dx, s.y + dy);
    layoutRef.current = makeLayout();
    dragTo({ x: Math.min(Math.max(p.x, L.cellsX + 1), L.width - 1), y: Math.min(Math.max(p.y, L.cellsY + 1), L.height - 1) });
    edgeRaf.current = requestAnimationFrame(edgeScroll);
  };

  const longPress = () => {
    lpTimer.current = null;
    const g = gesture.current;
    if (!g || g.kind !== "pending") return;
    const { hit, id } = g;
    if (hit.area === "cell") {
      if (ctl.edit && ctl.canPoint()) {
        pointAt(hit.row, hit.col);
        gesture.current = { kind: "point", id, anchor: { row: hit.row, col: hit.col } };
      } else {
        if (!commitIfEditing()) return;
        ctl.selectCell(hit.row, hit.col, false);
        gesture.current = { kind: "select", id, anchor: { row: hit.row, col: hit.col } };
      }
    } else if (hit.area === "colHeader" && commitIfEditing()) {
      ctl.selectColumns(hit.col, hit.col);
      gesture.current = { kind: "colsel", id, start: hit.col };
    } else if (hit.area === "rowHeader" && commitIfEditing()) {
      ctl.selectRows(hit.row, hit.row);
      gesture.current = { kind: "rowsel", id, start: hit.row };
    } else return;
    navigator.vibrate?.(8);
  };

  const startPinch = () => {
    clearLongPress();
    const [a, b] = [...pointers.current.values()];
    gesture.current = { kind: "pinch", d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z0: ctl.sheet.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, before: makeLayout() };
  };

  const pinchMove = () => {
    const g = gesture.current;
    if (!g || g.kind !== "pinch") return;
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    ctl.sheet.zoom = clampZoom(g.z0 * (d / g.d0));
    const after = makeLayout(0, 0);
    const p = zoomAround(g.before, after, g.cx, g.cy, (a.x + b.x) / 2, (a.y + b.y) / 2);
    const s = scroll();
    const max = after.maxScroll();
    s.x = Math.max(0, Math.min(max.x, p.x));
    s.y = Math.max(0, Math.min(max.y, p.y));
    draw();
  };

  const endPinch = () => {
    ctl.sheet.zoom = Math.round(clampZoom(ctl.sheet.zoom));
    setScroll(scroll().x, scroll().y);
    draw();
    ctl.emit();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Odak (formül çubuğu) ve klavye yerinde kalır; tarayıcı hareketleri engellenir
    e.preventDefault();
    const el = wrapRef.current!;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* yok say */
    }
    const flinging = stopFling();
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      startPinch();
      return;
    }
    if (pointers.current.size > 2) return;
    const L = layoutRef.current ?? makeLayout();
    const hit = cellAtPoint(L, p.x, p.y);
    lastPoint.current = p;
    if (showHandles()) {
      const h = nearestHandle(selectionHandles(L, ctl.range), p.x, p.y, e.pointerType === "mouse" ? 10 : 24);
      if (h) {
        const r = ctl.range;
        gesture.current = { kind: "handle", id: e.pointerId, fixed: h.kind === "end" ? { row: r.r1, col: r.c1 } : { row: r.r2, col: r.c2 } };
        ctl.corner = h.kind === "end" ? { row: r.r2, col: r.c2 } : { row: r.r1, col: r.c1 };
        return;
      }
    }
    if (e.pointerType === "mouse") {
      // Fare: masaüstündeki gibi basınca seçer, sürükleyince aralık seçer
      tap(hit, p, e.timeStamp);
      if (hit.area === "cell" && ctl.edit && ctl.edit.pointSpan) gesture.current = { kind: "point", id: e.pointerId, anchor: { row: hit.row, col: hit.col } };
      else if (hit.area === "cell" && !ctl.edit) gesture.current = { kind: "select", id: e.pointerId, anchor: { row: hit.row, col: hit.col } };
      else if (hit.area === "colHeader" && !ctl.edit) gesture.current = { kind: "colsel", id: e.pointerId, start: hit.col };
      else if (hit.area === "rowHeader" && !ctl.edit) gesture.current = { kind: "rowsel", id: e.pointerId, start: hit.row };
      else gesture.current = null;
      return;
    }
    const s = scroll();
    gesture.current = { kind: "pending", id: e.pointerId, x0: p.x, y0: p.y, sx: s.x, sy: s.y, hit, flinging };
    clearLongPress();
    lpTimer.current = setTimeout(longPress, LONG_PRESS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      pinchMove();
      return;
    }
    if (g.id !== e.pointerId) return;
    switch (g.kind) {
      case "pending": {
        const dx = p.x - g.x0;
        const dy = p.y - g.y0;
        if (dx * dx + dy * dy < SLOP * SLOP) return;
        clearLongPress();
        const axis = axisLock(dx, dy);
        gesture.current = { kind: "pan", id: g.id, lastX: p.x, lastY: p.y, axis };
        inertia.current.reset();
        inertia.current.track(e.timeStamp, p.x, p.y);
        setScroll(axis === "y" ? g.sx : g.sx - dx, axis === "x" ? g.sy : g.sy - dy);
        return;
      }
      case "pan": {
        const dx = g.axis === "y" ? 0 : p.x - g.lastX;
        const dy = g.axis === "x" ? 0 : p.y - g.lastY;
        g.lastX = p.x;
        g.lastY = p.y;
        inertia.current.track(e.timeStamp, p.x, p.y);
        const s = scroll();
        setScroll(s.x - dx, s.y - dy);
        return;
      }
      default:
        lastPoint.current = p;
        dragTo(p);
        if (!edgeRaf.current) edgeRaf.current = requestAnimationFrame(edgeScroll);
    }
  };

  const endPointer = (e: React.PointerEvent, cancelled: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.delete(e.pointerId);
    try {
      wrapRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* yok say */
    }
    clearLongPress();
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      // Kalan parmakla kaydırma sürer
      const rest = [...pointers.current.entries()][0];
      gesture.current = rest ? { kind: "pan", id: rest[0], lastX: rest[1].x, lastY: rest[1].y, axis: null } : null;
      inertia.current.reset();
      endPinch();
      return;
    }
    if (g.id !== e.pointerId) return;
    gesture.current = null;
    cancelAnimationFrame(edgeRaf.current);
    edgeRaf.current = 0;
    if (cancelled) return;
    if (g.kind === "pending") {
      // Kayan ızgarayı durduran dokunma seçim yapmaz
      if (!g.flinging) tap(g.hit, p, e.timeStamp);
    } else if (g.kind === "pan") {
      const v = inertia.current.release(e.timeStamp);
      startFling(g.axis === "y" ? 0 : v.vx, g.axis === "x" ? 0 : v.vy);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      const L = layoutRef.current;
      const p = local(e);
      if (L) zoomTo(ctl.sheet.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), p.x, p.y);
      return;
    }
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.deltaMode === 1) {
      dx *= 40;
      dy *= 20;
    } else if (e.deltaMode === 2) {
      dx *= size.current.w;
      dy *= size.current.h;
    }
    if (e.shiftKey && !dx) {
      dx = dy;
      dy = 0;
    }
    stopFling();
    const s = scroll();
    setScroll(s.x + dx, s.y + dy);
  };

  /* ------------------------------ Katmanlar ------------------------------ */

  const L = size.current.w ? makeLayout() : null;
  if (L) renderedKey.current = keyOf(L);
  const e = ctl.edit;
  let editBox: React.ReactNode = null;
  if (L && e && e.sheetId === sheet.id) {
    const m = sheet.mergeAt(e.row, e.col);
    const rc = m ? L.cellRect(m.r1, m.c1, m.r2, m.c2) : L.cellRect(e.row, e.col);
    if (rc.x + rc.w > L.headerW && rc.y + rc.h > L.headerH && rc.x < L.width && rc.y < L.height) {
      const st = ctl.wb.styleAt(sheet, e.row, e.col);
      const color = st.color ?? "#000000";
      const paperFill = !!st.fill && !isWhite(st.fill) && !(dark && lightNeutral(st.fill));
      editBox = (
        <div
          className="m-tablo-celledit"
          aria-hidden="true"
          style={{
            left: Math.max(L.headerW, rc.x),
            top: Math.max(L.headerH, rc.y),
            minWidth: rc.w,
            minHeight: rc.h,
            maxWidth: Math.max(rc.w, L.width - rc.x - 2),
            font: fontCss(st, L.z, fontStack),
            color: dark && !paperFill ? ink(color) : color,
            background: paperFill ? st.fill : dark ? (st.fill && !isWhite(st.fill) ? darkGround(st.fill) : DARK_BG) : (st.fill ?? "#FFFFFF"),
          }}
        >
          <ColoredText text={e.text} />
        </div>
      );
    }
  }

  return (
    <div
      ref={wrapRef}
      className="m-tablo-grid"
      role="application"
      aria-roledescription="hesap tablosu"
      aria-label={`${sheet.name} sayfası`}
      aria-describedby={describedBy}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(ev) => endPointer(ev, false)}
      onPointerCancel={(ev) => endPointer(ev, true)}
      onWheel={onWheel}
      onContextMenu={(ev) => ev.preventDefault()}
    >
      <canvas ref={canvasRef} className="m-tablo-canvas" aria-hidden="true" />
      {L && hasObjects() && (
        <div className="m-tablo-objects">
          {dark && <style>{objectsDarkCss(sheet.charts, ".m-tablo-objects")}</style>}
          <PivotPlaceholders ctl={ctl} layout={L} />
          <FloatingLayer ctl={ctl} layout={L} />
          <SlicerLayer ctl={ctl} layout={L} />
        </div>
      )}
      {editBox}
    </div>
  );
}
