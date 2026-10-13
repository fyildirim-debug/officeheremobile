// Tema: masaüstüyle aynı belirteçler (Renkli/Beyaz/Koyu Gri/Siyah) + mobilde varsayılan "Sistem".
import { useEffect, useState } from "react";
import { applyUiTheme, type UiTheme } from "@officehere/ui";

const KEY = "officehere.mobile.theme";
const EVENT = "officehere:mobile-theme";

export const THEMES: { id: UiTheme; label: string }[] = [
  { id: "system", label: "Sistem ayarını kullan" },
  { id: "colorful", label: "Açık (Renkli)" },
  { id: "white", label: "Açık (Beyaz)" },
  { id: "dark", label: "Koyu Gri" },
  { id: "black", label: "Siyah" },
];

export function readTheme(): UiTheme {
  try {
    return (localStorage.getItem(KEY) as UiTheme) || "system";
  } catch {
    return "system";
  }
}

export function setTheme(t: UiTheme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // depolama kapalı: yalnız bu oturum
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: t }));
}

const systemDark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

/** Seçili tema ve şu an koyu çizilip çizilmediği (sistem ayarı değişince güncellenir). */
export function useTheme(): { theme: UiTheme; dark: boolean; setTheme: (t: UiTheme) => void } {
  const [theme, setState] = useState<UiTheme>(readTheme);
  const [sys, setSys] = useState(systemDark);
  useEffect(() => {
    const on = (e: Event) => setState((e as CustomEvent<UiTheme>).detail);
    window.addEventListener(EVENT, on);
    const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
    const onMq = () => setSys(systemDark());
    mq?.addEventListener("change", onMq);
    return () => {
      window.removeEventListener(EVENT, on);
      mq?.removeEventListener("change", onMq);
    };
  }, []);
  const dark = theme === "dark" || theme === "black" || (theme === "system" && sys);
  useEffect(() => {
    applyUiTheme(theme);
    document.documentElement.toggleAttribute("data-oh-dark", dark);
    // Durum çubuğu ve tarayıcı kabuğu rengi.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--oh-titlebar-bg").trim() || "#3d3d8f");
  }, [theme, dark]);
  return { theme, dark, setTheme };
}
