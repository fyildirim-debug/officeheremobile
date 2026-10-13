// Ekran klavyesi: görünür alan (visualViewport) küçülünce ekran ona sığdırılır; böylece formül
// çubuğu klavyenin üstünde, seçili hücre görünür kalır. Tarayıcıda (yalnız görünür alan küçülür)
// ve Capacitor'da (WebView yeniden boyutlanır) aynı çalışır.
import { useEffect, useState } from "react";

export interface ViewportState {
  /** Klavye açık mı (görünür alan, bu genişlikte görülen en büyük yükseklikten belirgin kısa). */
  keyboard: boolean;
  height: number;
  top: number;
}

/** Görünür alan yüksekliği bu kadar kısalınca klavye açık sayılır. */
const KEYBOARD_MIN = 120;

export function keyboardOpen(fullHeight: number, visibleHeight: number): boolean {
  return fullHeight - visibleHeight > KEYBOARD_MIN;
}

export function useVisualViewport(): ViewportState {
  const [st, setSt] = useState<ViewportState>({ keyboard: false, height: 0, top: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let width = window.innerWidth;
    let full = Math.max(window.innerHeight, vv.height);
    let frame = 0;
    const update = () => {
      frame = 0;
      // Döndürünce (genişlik değişince) tam yükseklik yeniden ölçülür
      if (Math.abs(window.innerWidth - width) > 2) {
        width = window.innerWidth;
        full = Math.max(window.innerHeight, vv.height);
      }
      full = Math.max(full, window.innerHeight);
      const kb = keyboardOpen(full, vv.height);
      setSt((p) => (p.keyboard === kb && Math.abs(p.height - vv.height) < 1 && Math.abs(p.top - vv.offsetTop) < 1 ? p : { keyboard: kb, height: vv.height, top: vv.offsetTop }));
    };
    const on = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    window.addEventListener("resize", on);
    update();
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return st;
}
