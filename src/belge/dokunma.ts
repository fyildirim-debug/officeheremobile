// Dokunmatik yardımcılar: klavye açıkken görünür alan (visualViewport) ve iki parmakla yakınlaştırma.
import { useEffect, useRef, useState } from "react";

/**
 * Klavye görünür alanı daraltınca (tarayıcıda layout viewport küçülmez) ekran görünür alana sığdırılır;
 * böylece alt araç çubuğu ve paneller klavyenin üstünde kalır. Android'de pencere zaten küçülür.
 */
export function useGorunurAlan(): { h: number | null; top: number } {
  const [s, set] = useState<{ h: number | null; top: number }>({ h: null, top: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => {
      const kb = window.innerHeight - vv.height;
      const next = kb > 60 ? { h: Math.round(vv.height), top: Math.round(vv.offsetTop) } : { h: null, top: 0 };
      set((p) => (p.h === next.h && p.top === next.top ? p : next));
    };
    on();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
  return s;
}

export interface Kistirma {
  /** Hareket başladı: odak noktası (istemci koordinatı). */
  start: (cx: number, cy: number) => void;
  /** Önizleme ölçeği (başlangıca göre oran). */
  move: (r: number) => void;
  /** Bitti: son oran ve odak noktası. */
  end: (r: number, cx: number, cy: number) => void;
}

/**
 * İki parmakla yakınlaştırma (kıstırma). Hareket sırasında yalnız önizleme bildirilir (düzen yeniden
 * hesaplanmaz); parmaklar kalkınca son oran uygulanır.
 */
export function useKistirma(el: HTMLElement | null, h: Kistirma) {
  const ref = useRef(h);
  ref.current = h;
  useEffect(() => {
    if (!el) return;
    let d0 = 0;
    let c: { x: number; y: number } | null = null;
    let r = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      d0 = dist(e.touches) || 1;
      c = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
      r = 1;
      ref.current.start(c.x, c.y);
    };
    const onMove = (e: TouchEvent) => {
      if (!c || e.touches.length !== 2) return;
      e.preventDefault();
      r = dist(e.touches) / d0;
      ref.current.move(r);
    };
    const onEnd = (e: TouchEvent) => {
      if (!c || e.touches.length >= 2) return;
      const at = c;
      c = null;
      ref.current.end(r, at.x, at.y);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [el]);
}
