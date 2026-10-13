// Etkin slayt: ekrana sığdırılmış masaüstü SlideView; kaydırarak slayt değiştirme, iki parmakla
// yakınlaştırma, düzenleme kipinde metin kutusuna dokununca seçme/yazma.
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SlideView } from "@sunum/render/SlideView";
import { findShape } from "@sunum/model/ops";
import { layoutOf, levelResolver } from "@sunum/model/textStyle";
import type { Shape, SpShape, TableShape } from "@sunum/model/types";
import type { TextRenderCtx } from "@sunum/render/textHtml";
import { useAutofit } from "@sunum/editor/useAutofit";
import { useEditorRenderer } from "@sunum/editor/useEditorRenderer";
import { topLevelOf } from "@sunum/editor/canvasUtils";
import type { Actions } from "@sunum/state/actions";
import type { AppState } from "@sunum/state/store";
import type { SlaytGorunumu } from "./koyu";
import { bosMetin, duzenlenebilir } from "./oturum";

export interface SlaytAlaniProps {
  /** Ekranda çizilecek slayt (koyu temada eşlenmiş kopya); slayt yoksa null. */
  g: SlaytGorunumu | null;
  state: AppState;
  a: Actions;
  duzenle: boolean;
  onGit: (i: number) => void;
  /** Yalnız görüntülenen (şekil, resim, grafik, tablo) öğeye dokunuldu. */
  onSaltGoruntu?: () => void;
  bos?: ReactNode;
}

interface Yakin {
  z: number;
  x: number;
  y: number;
}

const PAD = 12;
const MAX_Z = 5;

type Hareket =
  | { tur: "bekle"; id: number; x0: number; y0: number; t0: number; target: Element | null; yon?: "yatay" | "dikey" | "kaydir" }
  | { tur: "cimdik"; d0: number; z0: number; cx: number; cy: number }
  | null;

export function SlaytAlani({ g, state, a, duzenle, onGit, onSaltGoruntu, bos }: SlaytAlaniProps) {
  const pres = state.pres;
  const index = state.slideIdx;
  const slide = pres.slides[index];
  const kapRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const [alan, setAlan] = useState({ w: 0, h: 0 });
  const [yak, setYak] = useState<Yakin>({ z: 1, x: 0, y: 0 });
  const [kayma, setKayma] = useState({ dx: 0, anim: false });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const hareket = useRef<Hareket>(null);
  const sonDokunma = useRef<{ t: number; x: number; y: number } | null>(null);
  const yakRef = useRef(yak);
  yakRef.current = yak;

  useLayoutEffect(() => {
    const el = kapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAlan({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setAlan({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Slayt değişince yakınlaştırma sıfırlanır.
  const sonIndex = useRef(index);
  if (sonIndex.current !== index) {
    sonIndex.current = index;
    if (yak.z !== 1 || yak.x || yak.y) setYak({ z: 1, x: 0, y: 0 });
  }

  const fit = alan.w && alan.h ? Math.max(0.01, Math.min((alan.w - PAD * 2) / pres.width, (alan.h - PAD * 2) / pres.height)) : 0;
  const k = fit * yak.z;
  const w = pres.width * k;
  const h = pres.height * k;

  /** Kaydırma sınırları: yakınlaşınca slayt kenarları alanın dışına taşmaz. */
  const sinirla = useCallback(
    (y: Yakin): Yakin => {
      const kk = fit * y.z;
      const mx = Math.max(0, (pres.width * kk - alan.w) / 2 + PAD);
      const my = Math.max(0, (pres.height * kk - alan.h) / 2 + PAD);
      return { z: y.z, x: Math.max(-mx, Math.min(mx, y.x)), y: Math.max(-my, Math.min(my, y.y)) };
    },
    [fit, pres.width, pres.height, alan.w, alan.h],
  );

  /* ------------------------- Metin düzenleyici ------------------------- */

  const temel = useEditorRenderer(a, () => a.s);
  // Düzenleyici her zaman özgün şekli ve özgün renk zincirini alır (koyu kopya kaydedilen modele karışmaz).
  const renderEditor = useCallback(
    (shape: SpShape | TableShape, trc: TextRenderCtx, cell?: [number, number]) => {
      const st = a.s;
      const sl = st.pres.slides[st.slideIdx];
      const orig = sl ? findShape(sl.shapes, shape.id) : undefined;
      if (!orig || (orig.kind !== "sp" && orig.kind !== "table")) return null;
      const layout = layoutOf(st.pres, sl);
      const lvl = orig.kind === "sp" ? levelResolver(orig, { master: st.pres.master, layout }) : trc.lvl;
      return temel(orig, { ...trc, theme: layout?.theme ?? st.pres.theme, lvl }, cell);
    },
    [a, temel],
  );

  const tctx = useMemo(() => ({ master: pres.master, layout: layoutOf(pres, slide) }), [pres, slide]);
  useAutofit({ slide, slideIdx: index, measuring: !!g, tctx, theme: tctx.layout?.theme ?? pres.theme, slideRef, actions: a });

  /* ------------------------- Dokunma ------------------------- */

  const dokun = (target: Element | null, x: number, y: number) => {
    if (!duzenle || !slide) {
      // Görüntüleme: çift dokunma yakınlaştırır / sığdırır.
      const son = sonDokunma.current;
      const now = Date.now();
      if (son && now - son.t < 320 && Math.hypot(son.x - x, son.y - y) < 32) {
        sonDokunma.current = null;
        const r = kapRef.current!.getBoundingClientRect();
        if (yakRef.current.z > 1.05) setYak({ z: 1, x: 0, y: 0 });
        else yakinlas(2.5, x - r.left, y - r.top);
      } else sonDokunma.current = { t: now, x, y };
      return;
    }
    const el = target?.closest("[data-shape-id]") as HTMLElement | null;
    const top = el && slideRef.current?.contains(el) ? topLevelOf(slide.shapes, el.dataset.shapeId!) : undefined;
    const ed = state.editing;
    if (!top) {
      a.stopEditing();
      a.select([]);
      return;
    }
    if (!duzenlenebilir(top)) {
      a.stopEditing();
      a.select([]);
      onSaltGoruntu?.();
      return;
    }
    if (ed?.shapeId === top.id) {
      a.textHandle?.placeCaret(x, y);
      return;
    }
    if (state.sel.includes(top.id) || bosMetin(top)) a.startEditing({ shapeId: top.id, point: { x, y } });
    else {
      a.stopEditing();
      a.select([top.id]);
    }
  };

  /** Alan içindeki (cx, cy) noktası sabit kalacak biçimde yakınlaştırır. */
  const yakinlas = (z: number, cx: number, cy: number) => {
    const y0 = yakRef.current;
    const k0 = fit * y0.z;
    const left0 = (alan.w - pres.width * k0) / 2 + y0.x;
    const top0 = (alan.h - pres.height * k0) / 2 + y0.y;
    const sx = (cx - left0) / k0;
    const sy = (cy - top0) / k0;
    const k1 = fit * z;
    const left1 = cx - sx * k1;
    const top1 = cy - sy * k1;
    setYak(sinirla({ z, x: left1 - (alan.w - pres.width * k1) / 2, y: top1 - (alan.h - pres.height * k1) / 2 }));
  };

  const git = (yon: -1 | 1) => {
    const hedef = index + yon;
    if (hedef < 0 || hedef >= pres.slides.length) return false;
    a.stopEditing();
    onGit(hedef);
    // Yeni slayt geldiği yönden kayarak girer.
    setKayma({ dx: yon * alan.w * 0.28, anim: false });
    requestAnimationFrame(() => requestAnimationFrame(() => setKayma({ dx: 0, anim: true })));
    return true;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Uyumluluk fare olayları (odak kayması, metin seçimi) engellenir; düzenleyici kendi olayını durdurur.
    e.preventDefault();
    try {
      kapRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // yapay olayda etkin işaretçi yok
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      const r = kapRef.current!.getBoundingClientRect();
      hareket.current = { tur: "cimdik", d0: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, z0: yakRef.current.z, cx: (p1.x + p2.x) / 2 - r.left, cy: (p1.y + p2.y) / 2 - r.top };
      setKayma({ dx: 0, anim: true });
      return;
    }
    if (pointers.current.size === 1) hareket.current = { tur: "bekle", id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: Date.now(), target: e.target as Element };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const prev = { ...p };
    p.x = e.clientX;
    p.y = e.clientY;
    const hr = hareket.current;
    if (!hr) return;
    if (hr.tur === "cimdik" && pointers.current.size >= 2) {
      const [p1, p2] = [...pointers.current.values()];
      const z = Math.max(1, Math.min(MAX_Z, (hr.z0 * Math.hypot(p1.x - p2.x, p1.y - p2.y)) / hr.d0));
      const r = kapRef.current!.getBoundingClientRect();
      const mx = (p1.x + p2.x) / 2 - r.left;
      const my = (p1.y + p2.y) / 2 - r.top;
      // Parmakların ortası altındaki slayt noktası sabit kalır (ortanın kayması kaydırmadır).
      const y0 = yakRef.current;
      const k0 = fit * y0.z;
      const left0 = (alan.w - pres.width * k0) / 2 + y0.x;
      const top0 = (alan.h - pres.height * k0) / 2 + y0.y;
      const sx = (hr.cx - left0) / k0;
      const sy = (hr.cy - top0) / k0;
      const k1 = fit * z;
      hr.cx = mx;
      hr.cy = my;
      setYak(sinirla({ z, x: mx - sx * k1 - (alan.w - pres.width * k1) / 2, y: my - sy * k1 - (alan.h - pres.height * k1) / 2 }));
      return;
    }
    if (hr.tur !== "bekle" || hr.id !== e.pointerId) return;
    const dx = e.clientX - hr.x0;
    const dy = e.clientY - hr.y0;
    if (!hr.yon && Math.hypot(dx, dy) > 10) hr.yon = yakRef.current.z > 1.02 ? "kaydir" : Math.abs(dx) > Math.abs(dy) * 1.2 ? "yatay" : "dikey";
    if (hr.yon === "kaydir") setYak((y) => sinirla({ ...y, x: y.x + (e.clientX - prev.x), y: y.y + (e.clientY - prev.y) }));
    else if (hr.yon === "yatay") {
      const ucta = (dx > 0 && index === 0) || (dx < 0 && index >= pres.slides.length - 1);
      setKayma({ dx: ucta ? dx * 0.25 : dx, anim: false });
    }
  };

  const bitir = (e: React.PointerEvent, iptal: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const hr = hareket.current;
    if (hr?.tur === "cimdik") {
      if (pointers.current.size === 0) {
        hareket.current = null;
        if (yakRef.current.z < 1.03) setYak({ z: 1, x: 0, y: 0 });
      }
      return;
    }
    hareket.current = null;
    if (!hr || hr.id !== e.pointerId || iptal) {
      setKayma({ dx: 0, anim: true });
      return;
    }
    const dx = e.clientX - hr.x0;
    const dt = Math.max(1, Date.now() - hr.t0);
    if (hr.yon === "yatay") {
      const hizli = Math.abs(dx) / dt > 0.45 && Math.abs(dx) > 30;
      if ((Math.abs(dx) > alan.w * 0.18 || hizli) && git(dx < 0 ? 1 : -1)) return;
      setKayma({ dx: 0, anim: true });
      return;
    }
    if (!hr.yon && dt < 600) dokun(hr.target, e.clientX, e.clientY);
  };

  const editing = state.editing;
  const selected = !editing && duzenle && slide ? state.sel.map((id) => findShape(slide.shapes, id)).filter((s): s is Shape => !!s) : [];
  const editShape = editing && slide ? findShape(slide.shapes, editing.shapeId) : undefined;
  const cerceve = (s: Shape, cls: string) => {
    const t = 2 / k;
    return <div key={`${cls}-${s.id}`} className={`m-sunum-secim ${cls}`} style={{ left: s.x - t * 2, top: s.y - t * 2, width: s.w + t * 2, height: s.h + t * 2, borderWidth: t, transform: s.rot ? `rotate(${s.rot}deg)` : undefined }} />;
  };

  return (
    <div
      ref={kapRef}
      className="m-sunum-sahne"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => bitir(e, false)}
      onPointerCancel={(e) => bitir(e, true)}
      onContextMenu={(e) => e.preventDefault()}
      data-yakin={yak.z > 1.02 ? "" : undefined}
    >
      {g && fit > 0 ? (
        <div
          className={`m-sunum-kagit${kayma.anim ? " is-kayiyor" : ""}`}
          style={{ left: (alan.w - w) / 2 + yak.x, top: (alan.h - h) / 2 + yak.y, width: w, height: h, transform: kayma.dx ? `translateX(${kayma.dx}px)` : undefined }}
          role="group"
          aria-label={`Slayt ${index + 1} / ${pres.slides.length}`}
        >
          <div ref={slideRef} className="m-sunum-olcek" style={{ width: pres.width, height: pres.height, transform: `scale(${k})` }}>
            <SlideView
              pres={g.pres}
              slide={g.slide}
              slideNumber={index + 1}
              mode={duzenle ? "edit" : "thumb"}
              editing={duzenle ? editing : null}
              renderEditor={duzenle ? renderEditor : undefined}
              className={g.className}
              shapeClass={g.shapeClass}
            />
            {selected.map((s) => cerceve(s, "is-secili"))}
            {editShape && cerceve(editShape, "is-duzenle")}
          </div>
        </div>
      ) : (
        g === null && bos
      )}
      {slide && pres.slides.length > 0 && (
        <span className={`m-sunum-sayac${slide.hidden ? " is-gizli" : ""}`} aria-hidden>
          {index + 1} / {pres.slides.length}
        </span>
      )}
    </div>
  );
}

