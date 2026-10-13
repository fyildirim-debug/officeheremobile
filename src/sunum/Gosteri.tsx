// Slayt gösterisi: masaüstü SlideShow (geçişler, animasyonlar) tam ekranda; dokunmayla ileri,
// sol kenara dokunma ya da sağa kaydırmayla geri, üst köşedeki düğme ya da geri tuşuyla çıkış.
// Kalem araçları (lazer işaretçisi, kalem, vurgulayıcı, silgi) masaüstü mürekkep katmanıyla (InkOverlay)
// slaydın üstüne çizer; araç seçiliyken dokunma ilerletmez, gezinme araç çubuğundaki oklarla yapılır.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft24Regular, ChevronRight24Regular, Delete24Regular, Dismiss24Regular, Eraser24Regular, Highlight24Regular, Pen24Regular, TapSingle24Regular } from "@fluentui/react-icons";
import { SlideShow } from "@sunum/show/SlideShow";
import { InkOverlay, SHOW_INK_COLORS, type ShowStroke, type ShowTool } from "@sunum/show/ShowInk";
import type { Presentation } from "@sunum/model/types";
import { useBackHandler } from "../shell/back";

/** Lazer işaretçisi simgesi (kırmızı nokta). */
function LazerSimgesi() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="#ff1a1a" fillOpacity="0.25" />
      <circle cx="12" cy="12" r="4.5" fill="#ff1a1a" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

const GOSTERI_ARACLARI: { id: ShowTool; label: string; icon: ReactNode }[] = [
  { id: "pointer", label: "Dokunarak ilerle", icon: <TapSingle24Regular /> },
  { id: "laser", label: "Lazer işaretçisi", icon: <LazerSimgesi /> },
  { id: "pen", label: "Kalem", icon: <Pen24Regular /> },
  { id: "highlighter", label: "Vurgulayıcı", icon: <Highlight24Regular /> },
  { id: "eraser", label: "Silgi", icon: <Eraser24Regular /> },
];

/** Kalem renkleri (masaüstü gösteri mürekkep renklerinden). */
const KALEM_RENKLERI = SHOW_INK_COLORS.filter((c) => ["#E81123", "#000000", "#FFFFFF", "#0078D4", "#107C10", "#FFE600"].includes(c.hex));

export interface GosteriProps {
  pres: Presentation;
  start: number;
  onExit: (lastIndex: number) => void;
}

/** Yatay slaytta tam ekrana geçilince yatay yönelim istenir (desteklenmiyorsa sessizce geçilir). */
function yonelimKilitle() {
  const o = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
  o?.lock?.("landscape").catch(() => undefined);
}

function yonelimBirak() {
  try {
    (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
  } catch {
    // yok
  }
}

export function Gosteri({ pres, start, onExit }: GosteriProps) {
  const kok = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  const [ustGizli, setUstGizli] = useState(false);
  const hareket = useRef<{ id: number; x: number; y: number; t: number } | null>(null);
  const tiklamaYut = useRef(false);
  // Kalem araçları (mürekkep yalnız gösteri süresince tutulur; slayta eklenmez).
  const [palet, setPalet] = useState(false);
  const [arac, setArac] = useState<ShowTool>("pointer");
  const [kalemRengi, setKalemRengi] = useState(SHOW_INK_COLORS[0].hex);
  const [vurguRengi, setVurguRengi] = useState(SHOW_INK_COLORS[5].hex);
  const [murekkep, setMurekkep] = useState<Record<string, ShowStroke[]>>({});
  const [olcekEl, setOlcekEl] = useState<HTMLElement | null>(null);
  const aracRef = useRef(arac);
  aracRef.current = arac;

  /** Gösteriye tuş gönderir (masaüstü kısayolları: ok tuşları, Esc). */
  const tus = useCallback((key: string) => {
    kok.current?.querySelector(".show-root")?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }, []);

  // Geri: önce kalem araçları kapanır, sonra gösteri biter.
  useBackHandler(() => {
    if (palet || aracRef.current !== "pointer") {
      setPalet(false);
      setArac("pointer");
      return;
    }
    tus("Escape");
  });

  // Masaüstü gösterisi kendi kökünü tam ekrana alır; üst denetimler o köke yerleştirilir (tam ekranda görünsün).
  const [kokEl, setKokEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setKokEl(kok.current?.querySelector<HTMLElement>(".show-root") ?? null), []);

  useEffect(() => {
    const yatay = pres.width >= pres.height;
    const onFs = () => {
      if (document.fullscreenElement && yatay) yonelimKilitle();
    };
    document.addEventListener("fullscreenchange", onFs);
    onFs();
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      yonelimBirak();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geçerli slayt (sayaç için) çizilen katmandan okunur.
  useEffect(() => {
    const el = kok.current;
    if (!el) return;
    const oku = () => {
      const layers = el.querySelectorAll<HTMLElement>(".show-layer > .sv");
      const id = layers[layers.length - 1]?.dataset.slideId;
      const i = pres.slides.findIndex((s) => s.id === id);
      if (i >= 0) setIndex(i);
      // Mürekkep katmanı ölçekli slayt kabının içine yerleşir (slayt koordinatlarında).
      const sc = el.querySelector<HTMLElement>(".show-stage > .show-scale");
      setOlcekEl((o) => (o === sc ? o : sc));
    };
    const mo = new MutationObserver(oku);
    mo.observe(el, { childList: true, subtree: true });
    oku();
    return () => mo.disconnect();
  }, [pres]);

  // Üst denetimler her dokunuşta görünür, bir süre dokunulmayınca söner.
  const [uyan, setUyan] = useState(0);
  useEffect(() => {
    setUstGizli(false);
    const t = window.setTimeout(() => setUstGizli(true), 3000);
    return () => window.clearTimeout(t);
  }, [index, uyan]);

  // Lazer noktası ekranda parmak ucu büyüklüğünde kalsın (slayt ölçeğinden bağımsız).
  const [olcek, setOlcek] = useState(1);
  useEffect(() => {
    const sahne = olcekEl?.parentElement;
    if (!sahne) return;
    const hesap = () => setOlcek(Math.max(0.05, sahne.getBoundingClientRect().width / pres.width));
    hesap();
    const ro = new ResizeObserver(hesap);
    ro.observe(sahne);
    return () => ro.disconnect();
  }, [olcekEl, pres.width]);

  const slaytId = pres.slides[index]?.id;
  const cizgiler = (slaytId && murekkep[slaytId]) || [];

  /** Araç çubuğu: açılınca kalem seçilir; kapanınca dokunarak ilerlemeye dönülür (mürekkep kalır). */
  const aracPaleti = (ac: boolean) => {
    setPalet(ac);
    setArac(ac ? "pen" : "pointer");
  };

  const onPointerDown = (e: React.PointerEvent) => {
    hareket.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now() };
    tiklamaYut.current = false;
    setUyan((v) => v + 1);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const h = hareket.current;
    hareket.current = null;
    // Araç seçiliyken kaydırma çizimdir, gezinme değil.
    if (!h || h.id !== e.pointerId || aracRef.current !== "pointer") return;
    const dx = e.clientX - h.x;
    const dy = e.clientY - h.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - h.t < 900) {
      tiklamaYut.current = true;
      tus(dx < 0 ? "ArrowRight" : "ArrowLeft");
    }
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (tiklamaYut.current) {
      tiklamaYut.current = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    const t = e.target as Element;
    if (t.closest(".m-sunum-show-ust, .m-sunum-show-arac, button, a, video, audio, [data-media], [data-link], .show-grid, .show-end")) return;
    // Kalem/lazer seçiliyken dokunma ilerletmez.
    if (aracRef.current !== "pointer") {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    // Sol kenara dokunma bir önceki adıma döner.
    if (e.clientX < window.innerWidth * 0.28) {
      e.stopPropagation();
      tus("ArrowLeft");
    }
  };

  return (
    <div
      ref={kok}
      className="m-sunum-show"
      style={{ "--m-lazer-ic": `${8 / olcek}px`, "--m-lazer-dis": `${18 / olcek}px` } as React.CSSProperties}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (hareket.current = null)}
      onClickCapture={onClickCapture}
      onContextMenuCapture={(e) => {
        // Masaüstü bağlam menüsü yerine dokunmatik denetimler.
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <SlideShow pres={pres} startIndex={start} mode="full" onExit={(i) => onExit(i)} />
      {olcekEl &&
        slaytId &&
        createPortal(
          <InkOverlay
            width={pres.width}
            height={pres.height}
            tool={arac}
            color={arac === "highlighter" ? vurguRengi : kalemRengi}
            strokes={cizgiler}
            visible
            onAdd={(c) => setMurekkep((m) => ({ ...m, [slaytId]: [...(m[slaytId] ?? []), c] }))}
            onErase={(sil) => setMurekkep((m) => ({ ...m, [slaytId]: (m[slaytId] ?? []).filter((_, i) => !sil.includes(i)) }))}
          />,
          olcekEl,
        )}
      {kokEl &&
        createPortal(
          <>
            <div className={`m-sunum-show-ust${ustGizli && !palet ? " is-gizli" : ""}`}>
              <span aria-live="polite">
                {index + 1} / {pres.slides.length}
              </span>
              <div className="m-sunum-show-ust-sag">
                <button type="button" className={`m-iconbtn${palet ? " is-active" : ""}`} aria-label="Kalem ve lazer işaretçisi" title="Kalem ve lazer işaretçisi" aria-pressed={palet} onClick={() => aracPaleti(!palet)}>
                  <Pen24Regular />
                </button>
                <button type="button" className="m-iconbtn" aria-label="Gösteriyi bitir" title="Gösteriyi bitir" onClick={() => tus("Escape")}>
                  <Dismiss24Regular />
                </button>
              </div>
            </div>
            {palet && (
              <div className="m-sunum-show-arac" role="toolbar" aria-label="Kalem araçları">
                <div className="m-sunum-show-arac-satir">
                  <button type="button" className="m-iconbtn" aria-label="Önceki" title="Önceki" onClick={() => tus("ArrowLeft")}>
                    <ChevronLeft24Regular />
                  </button>
                  {GOSTERI_ARACLARI.map((a) => (
                    <button key={a.id} type="button" className={`m-iconbtn${arac === a.id ? " is-active" : ""}`} aria-label={a.label} title={a.label} aria-pressed={arac === a.id} onClick={() => setArac(a.id)}>
                      {a.icon}
                    </button>
                  ))}
                  <button type="button" className="m-iconbtn" aria-label="Slayttaki mürekkebi sil" title="Slayttaki mürekkebi sil" disabled={!cizgiler.length} onClick={() => slaytId && setMurekkep((m) => ({ ...m, [slaytId]: [] }))}>
                    <Delete24Regular />
                  </button>
                  <button type="button" className="m-iconbtn" aria-label="Sonraki" title="Sonraki" onClick={() => tus("ArrowRight")}>
                    <ChevronRight24Regular />
                  </button>
                </div>
                {(arac === "pen" || arac === "highlighter") && (
                  <div className="m-sunum-show-arac-satir" role="radiogroup" aria-label="Mürekkep rengi">
                    {KALEM_RENKLERI.map((c) => {
                      const secili = (arac === "highlighter" ? vurguRengi : kalemRengi) === c.hex;
                      return (
                        <button
                          key={c.hex}
                          type="button"
                          role="radio"
                          aria-checked={secili}
                          className={`m-sunum-show-renk${secili ? " is-on" : ""}`}
                          aria-label={c.name}
                          title={c.name}
                          onClick={() => (arac === "highlighter" ? setVurguRengi(c.hex) : setKalemRengi(c.hex))}
                        >
                          <i style={{ background: c.hex }} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>,
          kokEl,
        )}
    </div>
  );
}
