// Slayt gösterisi: masaüstü SlideShow (geçişler, animasyonlar) tam ekranda; dokunmayla ileri,
// sol kenara dokunma ya da sağa kaydırmayla geri, üst köşedeki düğme ya da geri tuşuyla çıkış.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Dismiss24Regular } from "@fluentui/react-icons";
import { SlideShow } from "@sunum/show/SlideShow";
import type { Presentation } from "@sunum/model/types";
import { useBackHandler } from "../shell/back";

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

  /** Gösteriye tuş gönderir (masaüstü kısayolları: ok tuşları, Esc). */
  const tus = useCallback((key: string) => {
    kok.current?.querySelector(".show-root")?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }, []);

  useBackHandler(() => tus("Escape"));

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

  const onPointerDown = (e: React.PointerEvent) => {
    hareket.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now() };
    tiklamaYut.current = false;
    setUyan((v) => v + 1);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const h = hareket.current;
    hareket.current = null;
    if (!h || h.id !== e.pointerId) return;
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
    if (t.closest(".m-sunum-show-ust, button, a, video, audio, [data-media], [data-link], .show-grid, .show-end")) return;
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
      {kokEl &&
        createPortal(
          <div className={`m-sunum-show-ust${ustGizli ? " is-gizli" : ""}`}>
            <span aria-live="polite">
              {index + 1} / {pres.slides.length}
            </span>
            <button type="button" className="m-iconbtn" aria-label="Gösteriyi bitir" title="Gösteriyi bitir" onClick={() => tus("Escape")}>
              <Dismiss24Regular />
            </button>
          </div>,
          kokEl,
        )}
    </div>
  );
}
