// Android sistem çubukları ve klavye. Tema (<html data-oh-dark>, data-oh-theme), uygulama rengi
// (data-app) ve meta theme-color izlenir; durum çubuğu simgeleri üst çubuğun rengine, gezinme
// çubuğu simgeleri sayfa zeminine uydurulur.
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle, SystemBarType } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";

export interface OfficeHereWindowPlugin {
  /** Pencere zemini: eski WebView'lerde sistem çubuklarının arkasında görünür. */
  setBackground(o: { color: string }): Promise<void>;
  /** İlk ekran çizildi: açılış ekranı kapanır. */
  ready(): Promise<void>;
  /** Etkinlik kayıtlı durumla mı kuruldu (süreç sonlanmasından dönüş); yalnız ilk çağrıda doğru. */
  launchState(): Promise<{ restored: boolean }>;
}

export const OfficeHereWindow = registerPlugin<OfficeHereWindowPlugin>("OfficeHereWindow");

/** "#abc", "#aabbcc", "rgb(…)" ya da "rgba(…)" → "#rrggbb"; çözülemezse null. */
export function toHex(color: string): string | null {
  const c = color.trim().toLowerCase();
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/.exec(c);
  if (h) return "#" + (h[1].length === 3 ? [...h[1]].map((x) => x + x).join("") : h[1]);
  const r = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(c);
  if (r) return "#" + [r[1], r[2], r[3]].map((x) => Math.min(255, Math.round(Number(x))).toString(16).padStart(2, "0")).join("");
  return null;
}

/** Açık renk mi (üzerinde koyu simge daha okunaklı): WCAG bağıl parlaklık. */
export function isLightColor(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Siyah simgeyle karşıtlık beyazınkinden büyükse açık.
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05);
}

/** Herhangi bir CSS rengini (color-mix dahil) tarayıcıya çözdürür. */
function resolveColor(value: string): string | null {
  const direct = toHex(value);
  if (direct || !value.trim()) return direct;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000";
    ctx.fillStyle = value;
    return toHex(String(ctx.fillStyle));
  } catch {
    return null;
  }
}

export interface BarState {
  /** Üst çubuk (AppBar) rengi. */
  top: string;
  lightTop: boolean;
  lightNav: boolean;
}

/** WebView 140 öncesinde sistem çubuklarının arkası pencere zeminidir (Capacitor SystemBars). */
function paddedInsets(): boolean {
  const m = /Chrome\/(\d+)/.exec(navigator.userAgent);
  return !!m && Number(m[1]) < 140;
}

export function readBarState(): BarState {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  // data-app değişince (Belge mavi, Tablo yeşil, Sunum turuncu) meta güncellenmeyebilir: önce CSS belirteci.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? "";
  const top = resolveColor(css.getPropertyValue("--oh-titlebar-bg")) ?? resolveColor(meta) ?? "#3d3d8f";
  const lightTop = isLightColor(top);
  const dark = root.hasAttribute("data-oh-dark");
  return { top, lightTop, lightNav: paddedInsets() ? lightTop : !dark };
}

const quiet = (p: Promise<unknown>) => p.catch(() => {});

async function applyBars(s: BarState) {
  const top = s.lightTop ? SystemBarsStyle.Light : SystemBarsStyle.Dark;
  // SystemBars yapılandırma değişiminde (döndürme, koyu kip) kendi kayıtlı biçemini yeniden uygular:
  // iki eklentiye de aynı değer verilir. SystemBars.setStyle pencere zeminini sıfırladığından zemin en son.
  await quiet(SystemBars.setStyle({ style: top, bar: SystemBarType.StatusBar }));
  await quiet(SystemBars.setStyle({ style: s.lightNav ? SystemBarsStyle.Light : SystemBarsStyle.Dark, bar: SystemBarType.NavigationBar }));
  await quiet(StatusBar.setStyle({ style: s.lightTop ? Style.Light : Style.Dark }));
  await quiet(OfficeHereWindow.setBackground({ color: s.top }));
}

let stop: (() => void) | null = null;

/** Android'de bir kez başlatılır (native.ts yüklenince); durdurma işlevi döner. */
export function startNativeChrome(): () => void {
  if (stop) return stop;
  if (typeof document === "undefined" || !Capacitor.isNativePlatform()) return () => {};
  const root = document.documentElement;
  let last = "";
  let queued = false;
  let chain: Promise<void> = Promise.resolve();

  const update = () => {
    if (queued) return;
    queued = true;
    // Aynı karede gelen değişiklikler (tema + meta + data-app) tek uygulamada birleşir.
    requestAnimationFrame(() => {
      queued = false;
      const s = readBarState();
      const key = JSON.stringify(s);
      if (key === last) return;
      last = key;
      chain = chain.then(() => applyBars(s));
    });
  };

  const themeObserver = new MutationObserver(update);
  themeObserver.observe(root, { attributes: true, attributeFilter: ["data-oh-dark", "data-oh-theme", "data-app"] });
  const metaObserver = new MutationObserver(update);
  metaObserver.observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ["content"] });
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", update);
  update();

  // İlk ekran çizilince açılış ekranı kapanır (yerel taraf en geç 3 sn sonra kendisi kapatır).
  const app = document.getElementById("root");
  const ready = () => requestAnimationFrame(() => requestAnimationFrame(() => void quiet(OfficeHereWindow.ready())));
  let rootObserver: MutationObserver | null = null;
  if (!app || app.childElementCount) ready();
  else {
    rootObserver = new MutationObserver(() => {
      if (!app.childElementCount) return;
      rootObserver?.disconnect();
      ready();
    });
    rootObserver.observe(app, { childList: true });
  }

  // Klavye: pencere yerelde yeniden boyutlanır (adjustResize); CSS için durum ve yükseklik.
  const handles = [
    Keyboard.addListener("keyboardWillShow", (info) => {
      root.setAttribute("data-oh-keyboard", "");
      root.style.setProperty("--m-keyboard-h", `${info.keyboardHeight}px`);
    }),
    Keyboard.addListener("keyboardWillHide", () => {
      root.removeAttribute("data-oh-keyboard");
      root.style.removeProperty("--m-keyboard-h");
    }),
  ].map((p) => p.catch(() => null));

  stop = () => {
    themeObserver.disconnect();
    metaObserver.disconnect();
    rootObserver?.disconnect();
    mq.removeEventListener("change", update);
    handles.forEach((h) => void h.then((x) => x?.remove()).catch(() => {}));
    stop = null;
  };
  return stop;
}
