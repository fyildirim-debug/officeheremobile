// Android geri tuşu: en son kaydedilen işleyici çalışır (açık panel → ekran → uygulamadan çık).
import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";

type Handler = () => boolean | void;
const stack: { fn: { current: Handler } }[] = [];
let installed = false;

async function install() {
  if (installed || !Capacitor.isNativePlatform()) return;
  installed = true;
  const { App } = await import("@capacitor/app");
  App.addListener("backButton", () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].fn.current() !== false) return;
    }
    void App.exitApp();
  });
}

/**
 * Geri tuşu işleyicisi kaydeder. İşleyici false dönerse bir alttakine geçilir.
 * Tarayıcıda Escape tuşu da aynı işleyiciyi çağırmaz (paneller kendi Escape'ini dinler).
 */
export function useBackHandler(fn: Handler, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    void install();
    const entry = { fn: ref };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [enabled]);
}
