// Küçük resim şeridi ve "Slaytlar" ızgarası: masaüstü ScaledSlide çizimi, görünür olunca çizilir.
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Add24Regular, Dismiss24Regular, EyeOff24Regular } from "@fluentui/react-icons";
import { ScaledSlide } from "@sunum/render/SlideView";
import { sameThumb } from "@sunum/panes/ThumbnailPane";
import type { Presentation } from "@sunum/model/types";
import type { KoyuSunu, SlaytGorunumu } from "./koyu";
import { useBackHandler } from "../shell/back";

/** Slayt i'nin ekrandaki görünümü (koyu temada eşlenmiş kopya). */
export type Gorunum = (i: number) => SlaytGorunumu;

export function gorunumFn(pres: Presentation, koyu: KoyuSunu | null): Gorunum {
  return (i) => (koyu ? koyu.slayt(i) : { pres, slide: pres.slides[i], koyu: false });
}

type ResimProps = { g: SlaytGorunumu; index: number; width: number };

/** Slayt değişmedikçe (ya da tema/asıl/düzen) yeniden çizilmez. */
export const KucukResim = memo(
  function KucukResim({ g, index, width }: ResimProps) {
    return (
      <span className={g.className}>
        <ScaledSlide pres={g.pres} slide={g.slide} slideNumber={index + 1} width={width} shapeClass={g.shapeClass} />
      </span>
    );
  },
  (a, b) => a.g.className === b.g.className && sameThumb({ pres: a.g.pres, slide: a.g.slide, index: a.index, width: a.width }, { pres: b.g.pres, slide: b.g.slide, index: b.index, width: b.width }),
);

/** Kaydırma kabında görünür olunca true olur (ve öyle kalır). */
function useGorunur(root: React.RefObject<HTMLElement | null>): [React.RefObject<HTMLButtonElement | null>, boolean] {
  const ref = useRef<HTMLButtonElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (vis || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVis(true);
      return;
    }
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVis(true), { root: root.current, rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [vis, root]);
  return [ref, vis];
}

export interface KucukProps {
  g: SlaytGorunumu;
  index: number;
  width: number;
  current: boolean;
  root: React.RefObject<HTMLElement | null>;
  onPick: (i: number) => void;
  /** Uzun basma / bağlam menüsü. */
  onMenu?: (i: number) => void;
}

/** Uzun basma: hareket etmeden ~0,5 sn basılı tutma (bağlam menüsü olayı gelmeyen ortamlar için de). */
function useUzunBasma(fn: (() => void) | undefined) {
  const t = useRef<{ id: number; x: number; y: number } | null>(null);
  const fired = useRef(false);
  const iptal = () => {
    if (t.current) window.clearTimeout(t.current.id);
    t.current = null;
  };
  useEffect(() => iptal, []);
  if (!fn) return { fired, props: {} };
  return {
    fired,
    props: {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false;
        iptal();
        if (e.pointerType === "mouse") return;
        const id = window.setTimeout(() => {
          fired.current = true;
          t.current = null;
          navigator.vibrate?.(12);
          fn();
        }, 480);
        t.current = { id, x: e.clientX, y: e.clientY };
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (t.current && Math.hypot(e.clientX - t.current.x, e.clientY - t.current.y) > 8) iptal();
      },
      onPointerUp: iptal,
      onPointerCancel: iptal,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        if (fired.current) return;
        iptal();
        fired.current = true;
        fn();
      },
    },
  };
}

export function KucukResimDugmesi({ g, index, width, current, root, onPick, onMenu }: KucukProps) {
  const [ref, vis] = useGorunur(root);
  const uzun = useUzunBasma(onMenu ? () => onMenu(index) : undefined);
  const hidden = !!g.slide.hidden;
  return (
    <button
      ref={ref}
      type="button"
      className={`m-sunum-thumb${current ? " is-current" : ""}${hidden ? " is-hidden" : ""}`}
      data-index={index}
      aria-label={`Slayt ${index + 1}${hidden ? " (gizli)" : ""}`}
      aria-current={current ? "true" : undefined}
      onClick={() => {
        if (uzun.fired.current) {
          uzun.fired.current = false;
          return;
        }
        onPick(index);
      }}
      {...uzun.props}
    >
      <span className="m-sunum-thumb-img" style={{ width, height: Math.round((width * g.pres.height) / g.pres.width) }}>
        {vis && <KucukResim g={g} index={index} width={width} />}
        {hidden && (
          <span className="m-sunum-gizli" aria-hidden>
            <EyeOff24Regular />
          </span>
        )}
      </span>
      <span className="m-sunum-thumb-no">{index + 1}</span>
    </button>
  );
}

export interface SeritProps {
  pres: Presentation;
  gorunum: Gorunum;
  current: number;
  onPick: (i: number) => void;
  onMenu?: (i: number) => void;
  /** Düzenleme kipinde sona slayt ekleme düğmesi. */
  onAdd?: () => void;
}

/** Slaytın altında yatay (yatay ekranda solda dikey) küçük resim şeridi. */
export function KucukResimSeridi({ pres, gorunum, current, onPick, onMenu, onAdd }: SeritProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [olcu, setOlcu] = useState({ dikey: false, w: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setOlcu({ dikey: getComputedStyle(el).flexDirection === "column", w: el.clientWidth }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const dikey = olcu.dikey;
  useEffect(() => {
    const el = ref.current?.querySelector(`[data-index="${current}"]`) as HTMLElement | null;
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [current, pres.slides.length]);
  // Geniş ekranda (tablet) küçük resimler büyür.
  const width = dikey ? 100 : olcu.w >= 700 ? 160 : 112;
  const h = Math.round((width * pres.height) / pres.width);
  return (
    <div className="m-sunum-seri" ref={ref} role="list" aria-label="Slaytlar">
      {pres.slides.map((s, i) => (
        <div key={s.id} role="listitem" style={{ display: "contents" }}>
          <KucukResimDugmesi g={gorunum(i)} index={i} width={width} current={i === current} root={ref} onPick={onPick} onMenu={onMenu} />
        </div>
      ))}
      {onAdd && (
        <button type="button" className="m-sunum-ekle" aria-label="Yeni slayt" title="Yeni slayt" style={{ width: Math.max(44, h), height: h }} onClick={onAdd}>
          <Add24Regular />
        </button>
      )}
    </div>
  );
}

export interface IzgaraProps {
  pres: Presentation;
  gorunum: Gorunum;
  current: number;
  onPick: (i: number) => void;
  onMenu?: (i: number) => void;
  onClose: () => void;
}

/** "Slaytlar" görünümü: tüm slaytlar küçük resim ızgarasında. */
export function SlaytIzgarasi({ pres, gorunum, current, onPick, onMenu, onClose }: IzgaraProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useBackHandler(() => onClose());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = ref.current?.querySelector(`[data-index="${current}"]`) as HTMLElement | null;
    el?.scrollIntoView?.({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const gap = 12;
  const inner = Math.max(0, w - 28);
  const cols = Math.max(2, Math.floor((inner + gap) / (150 + gap)));
  const colW = Math.floor((inner - gap * (cols - 1)) / cols);
  return (
    <section className="m-sunum-izgara" role="dialog" aria-label="Slaytlar">
      <header className="m-appbar">
        <button type="button" className="m-iconbtn" aria-label="Kapat" onClick={onClose}>
          <Dismiss24Regular />
        </button>
        <div className="m-appbar-title">
          <h1>Slaytlar</h1>
          <div className="m-appbar-sub">{pres.slides.length} slayt</div>
        </div>
      </header>
      <div className="m-sunum-izgara-govde" ref={ref}>
        {colW > 0 && (
          <div className="m-sunum-izgara-liste" role="list" style={{ gridTemplateColumns: `repeat(${cols}, ${colW}px)` }}>
            {pres.slides.map((s, i) => (
              <div key={s.id} role="listitem">
                <KucukResimDugmesi g={gorunum(i)} index={i} width={colW} current={i === current} root={ref} onPick={onPick} onMenu={onMenu} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
